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
    val: jest.fn(() => value)
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
  const onceByPath = new Map(Object.entries(options.onceByPath || {}));
  const onceByQuery = new Map(Object.entries(options.onceByQuery || {}));
  const setRejectsByPath = options.setRejectsByPath || {};

  const authApi = {
    createUser: jest.fn(),
    deleteUser: jest.fn()
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

  const makeRef = (pathName) => {
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
        writes.push({ op: "update", path: pathName, value });
        return undefined;
      }),
      remove: jest.fn(async () => {
        writes.push({ op: "remove", path: pathName });
        return undefined;
      }),
      once: jest.fn(async () => {
        if (!onceByPath.has(pathName)) {
          return snapshot(null, false);
        }

        return asSnapshot(onceByPath.get(pathName));
      })
    };

    ref.orderByChild = jest.fn((child) => ({
      equalTo: jest.fn((value) => ({
        once: jest.fn(async () => {
          const key = queryKey(pathName, child, value);
          if (!onceByQuery.has(key)) {
            return snapshot(null, false);
          }

          return asSnapshot(onceByQuery.get(key));
        })
      }))
    }));

    return ref;
  };

  const refMock = jest.fn(makeRef);
  const database = jest.fn(() => ({ ref: refMock }));
  database.ServerValue = { TIMESTAMP: 1700000000000 };

  const admin = {
    auth: jest.fn(() => authApi),
    database
  };
  const db = { ref: refMock };

  jest.doMock("firebase-functions", () => ({
    https: {
      HttpsError,
      onCall: (handler) => handler
    }
  }));

  jest.doMock("firebase-functions/v2/database", () => ({
    onValueCreated: (_path, handler) => handler,
    onValueUpdated: (_path, handler) => handler,
    onValueDeleted: (_path, handler) => handler
  }));

  jest.doMock(require.resolve("../../lib/shared/firebase"), () => ({ admin, db }));

  const translate = jest.fn();
  if (options.translateRejects) {
    translate.mockRejectedValue(options.translateRejects);
  } else {
    translate.mockResolvedValue([options.translateResult || ""]);
  }

  jest.doMock(require.resolve("../../lib/shared/translate"), () => ({
    TARGET_LANGUAGE: "en",
    translateClient: { translate }
  }));

  return {
    admin,
    authApi,
    db,
    HttpsError,
    queryKey,
    refMock,
    translate,
    writes
  };
}

module.exports = {
  HttpsError,
  queryKey,
  setupCallableTestEnv,
  snapshot
};
