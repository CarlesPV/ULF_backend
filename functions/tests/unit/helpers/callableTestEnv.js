class HttpsError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "HttpsError";
    this.code = code;
    this.details = details;
  }
}

function snapshot(value, exists = value !== undefined && value !== null) {
  return {
    exists: jest.fn(() => exists),
    val: jest.fn(() => value),
    forEach: jest.fn((callback) => {
      if (value && typeof value === "object") {
        Object.keys(value).forEach(key => {
          callback({
            key,
            val: () => value[key]
          });
        });
      }
    })
  };
}

function queryKey(pathName, child, value) {
  return `${pathName}|orderByChild:${child}|equalTo:${String(value)}`;
}

function asSnapshot(value) {
  if (value && typeof value.exists === "function" && typeof value.val === "function") {
    return value;
  }

  return snapshot(value);
}

function setupCallableTestEnv(options = {}) {
  jest.resetModules();

  const writes = [];
  let pushCounter = 0;
  const onceByPath = new Map(Object.entries(options.onceByPath || {}));
  const onceByQuery = new Map(Object.entries(options.onceByQuery || {}));
  const setRejectsByPath = options.setRejectsByPath || {};
  const updateRejectsByPath = options.updateRejectsByPath || {};
  const removeRejectsByPath = options.removeRejectsByPath || {};
  const onceRejectsByPath = options.onceRejectsByPath || {};
  const onceRejectsByQuery = options.onceRejectsByQuery || {};
  const sendRejectsByToken = options.sendRejectsByToken || {};
  const sendResultsByToken = options.sendResultsByToken || {};
  const pushKeys = options.pushKeys || [];

  const authApi = {
    createUser: jest.fn(),
    deleteUser: jest.fn(),
    deleteUsers: jest.fn(),
    listUsers: jest.fn()
  };

  if (options.createUserRejects) {
    authApi.createUser.mockRejectedValue(options.createUserRejects);
  } else {
    authApi.createUser.mockResolvedValue(options.createUserResult || { uid: "uid-test" });
  }

  if (options.deleteUserRejects) {
    authApi.deleteUser.mockRejectedValue(options.deleteUserRejects);
  } else {
    authApi.deleteUser.mockResolvedValue(undefined);
  }

  if (options.deleteUsersRejects) {
    authApi.deleteUsers.mockRejectedValue(options.deleteUsersRejects);
  } else {
    authApi.deleteUsers.mockResolvedValue(undefined);
  }

  if (options.listUsersRejects) {
    authApi.listUsers.mockRejectedValue(options.listUsersRejects);
  } else {
    const pages = options.listUsersPages || [{ users: [] }];
    authApi.listUsers.mockImplementation(async (_maxResults, pageToken) => {
      if (pageToken) {
        const page = pages.find((candidate) => candidate.inputPageToken === pageToken);
        return page || { users: [] };
      }

      return pages[0] || { users: [] };
    });
  }

  const messagingApi = {
    send: jest.fn(async (message) => {
      const token = message && message.token;
      if (sendRejectsByToken[token]) {
        throw sendRejectsByToken[token];
      }

      if (Object.prototype.hasOwnProperty.call(sendResultsByToken, token)) {
        return sendResultsByToken[token];
      }

      return `message-id-${token || "unknown"}`;
    })
  };

  const makeRef = (pathName = "") => {
    const ref = {
      path: pathName,
      set: jest.fn(async (value) => {
        if (setRejectsByPath[pathName]) {
          throw setRejectsByPath[pathName];
        }

        writes.push({ op: "set", path: pathName, value });
        return undefined;
      }),
      update: jest.fn(async (value) => {
        if (updateRejectsByPath[pathName]) {
          throw updateRejectsByPath[pathName];
        }

        writes.push({ op: "update", path: pathName, value });
        return undefined;
      }),
      remove: jest.fn(async () => {
        if (removeRejectsByPath[pathName]) {
          throw removeRejectsByPath[pathName];
        }

        writes.push({ op: "remove", path: pathName });
        return undefined;
      }),
      once: jest.fn(async () => {
        if (onceRejectsByPath[pathName]) {
          throw onceRejectsByPath[pathName];
        }

        if (!onceByPath.has(pathName)) {
          return snapshot(null, false);
        }

        return asSnapshot(onceByPath.get(pathName));
      }),
      push: jest.fn(() => {
        const newKey = pushKeys[pushCounter] || `mock-key-${pushCounter + 1}`;
        pushCounter += 1;
        const newPath = pathName ? `${pathName}/${newKey}` : newKey;
        const newRef = makeRef(newPath);
        newRef.key = newKey;
        return newRef;
      })
    };

    ref.orderByValue = jest.fn(() => ({
      once: ref.once
    }));

    ref.orderByChild = jest.fn((child) => ({
      equalTo: jest.fn((value) => ({
        once: jest.fn(async () => {
          const key = queryKey(pathName, child, value);
          if (onceRejectsByQuery[key]) {
            throw onceRejectsByQuery[key];
          }

          if (!onceByQuery.has(key)) {
            return snapshot(null, false);
          }

          return asSnapshot(onceByQuery.get(key));
        })
      }))
    }));

    return ref;
  };

  const firestoreWrites = [];
  const firestoreCollectionMock = jest.fn((colName) => ({
    add: jest.fn(async (docData) => {
      firestoreWrites.push({ op: "add", collection: colName, data: docData });
      return { id: "mock-firestore-doc-id" };
    }),
    where: jest.fn(() => ({
      get: jest.fn(async () => {
        const docs = (options.firestoreDocs && options.firestoreDocs[colName]) || [];
        return {
          forEach: (callback) => {
            docs.forEach((doc) => {
              callback({
                id: doc.id,
                data: () => doc.data,
                ref: {
                  delete: jest.fn(async () => {
                    firestoreWrites.push({ op: "delete", collection: colName, id: doc.id });
                    return undefined;
                  })
                }
              });
            });
          }
        };
      })
    }))
  }));
  const firestoreTimestampMock = {
    fromMillis: jest.fn((ms) => ({
      toMillis: () => ms,
      toDate: () => new Date(ms)
    })),
    now: jest.fn(() => ({
      toMillis: () => Date.now(),
      toDate: () => new Date()
    }))
  };

  const refMock = jest.fn(makeRef);
  const database = jest.fn(() => ({ ref: refMock }));
  database.ServerValue = { TIMESTAMP: 1700000000000 };

  const storageFileDeleteMock = jest.fn(async () => undefined);
  const storageFileMock = jest.fn(() => ({
    delete: storageFileDeleteMock
  }));
  const storageBucketMock = jest.fn(() => ({
    file: storageFileMock
  }));
  const storageApi = jest.fn(() => ({
    bucket: storageBucketMock
  }));

  const admin = {
    auth: jest.fn(() => authApi),
    database,
    messaging: jest.fn(() => messagingApi),
    storage: storageApi,
    firestore: Object.assign(jest.fn(() => ({ collection: firestoreCollectionMock })), {
      Timestamp: firestoreTimestampMock
    })
  };
  const db = { ref: refMock };

  jest.doMock("firebase-functions", () => ({
    https: {
      HttpsError,
      onCall: (handler) => handler
    },
    logger: {
      info: jest.fn((...args) => console.log(...args)),
      error: jest.fn((...args) => console.error(...args)),
      warn: jest.fn((...args) => console.warn(...args)),
      debug: jest.fn((...args) => console.debug(...args))
    }
  }));

  jest.doMock("firebase-functions/v2/database", () => ({
    onValueCreated: (_path, handler) => handler,
    onValueUpdated: (_path, handler) => handler,
    onValueDeleted: (_path, handler) => handler
  }));
  
  jest.doMock("firebase-functions/v2/storage", () => ({
    onObjectFinalized: (handler) => handler
  }));

  jest.doMock("firebase-functions/v2/scheduler", () => ({
    onSchedule: (_options, handler) => handler
  }));

  jest.doMock(require.resolve("../../../lib/shared/firebase"), () => ({ admin, db }));

  const translateText = jest.fn();
  if (options.translateRejects) {
    translateText.mockRejectedValue(options.translateRejects);
  } else {
    translateText.mockResolvedValue(options.translateResult || "");
  }

  const translateLabels = jest.fn(async (labelsText) => {
    const translation = options.translateResult || labelsText;
    return translation.split(",").map(l => l.trim().toLowerCase());
  });

  jest.doMock(require.resolve("../../../lib/shared/translate"), () => ({
    SUPPORTED_LANGUAGES: ["es", "en", "ca"],
    DEFAULT_LANGUAGE: "es",
    translateText,
    translateLabels,
    translateClient: { translate: jest.fn() } // For compatibility if any
  }));

  const labelDetection = jest.fn().mockResolvedValue([{
    labelAnnotations: [{ description: "test label" }]
  }]);

  jest.doMock(require.resolve("../../../lib/shared/vision"), () => ({
    visionClient: { labelDetection }
  }));

  return {
    admin,
    authApi,
    db,
    HttpsError,
    messagingApi,
    queryKey,
    refMock,
    translateText,
    labelDetection,
    writes,
    firestoreWrites,
    storageFileMock,
    storageFileDeleteMock
  };
}

module.exports = {
  HttpsError,
  queryKey,
  setupCallableTestEnv,
  snapshot
};
