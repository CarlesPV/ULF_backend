const admin = require("firebase-admin");
const { initializeApp, deleteApp } = require("firebase/app");
const {
  getAuth,
  connectAuthEmulator,
  signInWithEmailAndPassword
} = require("firebase/auth");
const {
  getDatabase,
  connectDatabaseEmulator,
  ref,
  get,
  goOffline,
  set
} = require("firebase/database");
const {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable
} = require("firebase/functions");
const {
  getStorage,
  connectStorageEmulator,
  ref: storageRef,
  uploadBytes,
  deleteObject,
  getMetadata
} = require("firebase/storage");

const PROJECT_ID = "demo-ulf";
const DEFAULT_PASSWORD = "secret123";

process.env.GCLOUD_PROJECT = PROJECT_ID;
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
process.env.FIREBASE_DATABASE_EMULATOR_HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST || "127.0.0.1:9000";

const clientApps = [];
let appCounter = 0;

const defaultCenter = {
  id: "uab",
  name: "Universitat Autonoma de Barcelona",
  email_domains: {
    uab_cat: true
  },
  boundary_coords: {},
  boundaries: [],
  bounds: {
    latMin: 41.48,
    latMax: 41.52,
    lngMin: 2.08,
    lngMax: 2.13
  },
  location: {
    lat: 41.5008587,
    lng: 2.1042399
  },
  radius_meters: 1500,
  is_active: true
};

function splitHostPort(value, fallbackHost, fallbackPort) {
  const cleanValue = (value || "").replace(/^https?:\/\//, "");
  const [host, port] = cleanValue.split(":");
  return {
    host: host || fallbackHost,
    port: Number(port || fallbackPort)
  };
}

function adminApp() {
  if (admin.apps.length > 0) return admin.app();

  return admin.initializeApp({
    projectId: PROJECT_ID,
    databaseURL: `https://${PROJECT_ID}.firebaseio.com`
  });
}

function adminDb() {
  return adminApp().database();
}

async function clearDatabase() {
  await adminDb().ref().set(null);
}

async function clearAuthUsers() {
  let pageToken;
  do {
    const result = await adminApp().auth().listUsers(1000, pageToken);
    await Promise.all(result.users.map((user) => adminApp().auth().deleteUser(user.uid)));
    pageToken = result.pageToken;
  } while (pageToken);
}

async function seedCenter(centerId = "uab", overrides = {}) {
  const center = {
    ...defaultCenter,
    ...overrides,
    id: centerId,
    email_domains: {
      ...defaultCenter.email_domains,
      ...(overrides.email_domains || {})
    },
    bounds: {
      ...defaultCenter.bounds,
      ...(overrides.bounds || {})
    },
    location: {
      ...defaultCenter.location,
      ...(overrides.location || {})
    }
  };

  await adminDb().ref(`centers/${centerId}`).set(center);
  return center;
}

async function resetEmulators() {
  await cleanupClientApps();
  await clearDatabase();
  await clearAuthUsers();
  await seedCenter();
}

async function createVerifiedUser({
  uid,
  email,
  password = DEFAULT_PASSWORD,
  name = "Test User",
  centerId = "uab",
  emailVerified = true,
  pushNotifications = false
}) {
  const userRecord = await adminApp().auth().createUser({
    uid,
    email,
    password,
    displayName: name,
    emailVerified
  });

  await adminDb().ref(`users/${uid}`).set({
    id: uid,
    center_id: centerId,
    role: "student",
    email,
    name,
    photo_path: "",
    settings: {
      language: "es",
      push_notifications: pushNotifications,
      dark_mode: false
    },
    created_at: Date.now(),
    updated_at: Date.now(),
    is_deleted: false
  });

  return userRecord;
}

function createClientApp() {
  const app = initializeApp({
    apiKey: "demo-api-key",
    authDomain: `${PROJECT_ID}.firebaseapp.com`,
    databaseURL: `https://${PROJECT_ID}.firebaseio.com`,
    storageBucket: `${PROJECT_ID}.appspot.com`,
    projectId: PROJECT_ID
  }, `integration-${Date.now()}-${++appCounter}`);

  const auth = getAuth(app);
  const database = getDatabase(app);
  const functions = getFunctions(app);
  const storage = getStorage(app);
  
  const authHost = splitHostPort(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1", 9099);
  const dbHost = splitHostPort(process.env.FIREBASE_DATABASE_EMULATOR_HOST, "127.0.0.1", 9000);
  const storageHost = splitHostPort(process.env.FIREBASE_STORAGE_EMULATOR_HOST, "127.0.0.1", 9199);

  connectAuthEmulator(auth, `http://${authHost.host}:${authHost.port}`, { disableWarnings: true });
  connectDatabaseEmulator(database, dbHost.host, dbHost.port);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  connectStorageEmulator(storage, storageHost.host, storageHost.port);

  const client = { app, auth, database, functions, storage };
  clientApps.push(app);
  return client;
}

async function signInClient(client, email, password = DEFAULT_PASSWORD) {
  await signInWithEmailAndPassword(client.auth, email, password);
  return client;
}

async function cleanupClientApps() {
  await Promise.all(clientApps.splice(0).map(async (app) => {
    try {
      goOffline(getDatabase(app));
    } catch (_error) {
      // Puede estar borrada si un test anterior ya hizo limpieza.
    }

    await deleteApp(app).catch(() => undefined);
  }));
}

function callFunction(client, name, data) {
  return httpsCallable(client.functions, name)(data);
}

async function waitFor(check, { timeout = 10000, interval = 100 } = {}) {
  const startedAt = Date.now();
  let lastError;

  // Los triggers del emulador son asíncronos; mejor polling corto que sleeps largos.
  while (Date.now() - startedAt < timeout) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  if (lastError) throw lastError;
  throw new Error("Timed out waiting for emulator state");
}

async function expectPermissionDenied(promise) {
  try {
    await promise;
    throw new Error("Expected permission denied");
  } catch (error) {
    const message = `${error.code || ""} ${error.message || ""}`.toLowerCase();
    expect(message).toContain("permission");
  }
}

module.exports = {
  DEFAULT_PASSWORD,
  PROJECT_ID,
  adminApp,
  adminDb,
  callFunction,
  cleanupClientApps,
  createClientApp,
  createVerifiedUser,
  defaultCenter,
  expectPermissionDenied,
  firebaseDb: {
    get,
    ref,
    set
  },
  firebaseStorage: {
    ref: storageRef,
    uploadBytes,
    deleteObject,
    getMetadata
  },
  resetEmulators,
  seedCenter,
  signInClient,
  waitFor
};
