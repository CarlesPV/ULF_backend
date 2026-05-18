const {
  adminApp,
  adminDb,
  cleanupClientApps
} = require("./firebaseEmulatorTestEnv");

afterEach(async () => {
  await cleanupClientApps();
});

afterAll(async () => {
  await cleanupClientApps();
  try {
    adminDb().goOffline();
    await adminApp().delete();
  } catch (_error) {
    // Hay suites que terminan sin haber inicializado la app Admin.
  }
});
