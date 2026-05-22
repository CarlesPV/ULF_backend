const {
  adminApp,
  adminDb,
  callFunction,
  createClientApp,
  resetEmulators,
  signInClient,
  firebaseDb
} = require("./helpers/firebaseEmulatorTestEnv");

async function expectFunctionError(promise, code) {
  try {
    await promise;
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect(error.code).toBe(`functions/${code}`);
  }
}

describe("integration: university registration", () => {
  beforeEach(async () => {
    await resetEmulators();
  });

  test("allowed university domain creates an Auth user and RTDB profile", async () => {
    const client = createClientApp();

    const result = await callFunction(client, "secureUniversityRegistration", {
      email: "ada@uab.cat",
      password: "secret123",
      name: "Ada",
      termsAccepted: true,
      privacyAccepted: true
    });

    expect(result.data).toEqual({
      success: true,
      uid: expect.any(String)
    });

    const userRecord = await adminApp().auth().getUser(result.data.uid);
    const profileSnap = await adminDb().ref(`users/${result.data.uid}`).once("value");

    expect(userRecord.email).toBe("ada@uab.cat");
    expect(profileSnap.val()).toEqual(expect.objectContaining({
      id: result.data.uid,
      center_id: "uab",
      role: "student",
      email: "ada@uab.cat",
      name: "Ada",
      legal: {
        termsAccepted: true,
        privacyAccepted: true,
        acceptedAt: expect.any(Number)
      },
      is_deleted: false
    }));
  });

  test("registration without legal acceptance is rejected", async () => {
    const client = createClientApp();

    await expectFunctionError(callFunction(client, "secureUniversityRegistration", {
      email: "ada@uab.cat",
      password: "secret123",
      name: "Ada",
      termsAccepted: false,
      privacyAccepted: true
    }), "invalid-argument");

    await expectFunctionError(callFunction(client, "secureUniversityRegistration", {
      email: "ada@uab.cat",
      password: "secret123",
      name: "Ada",
      termsAccepted: true,
      privacyAccepted: false
    }), "invalid-argument");
  });

  test("unregistered domains are rejected", async () => {
    const client = createClientApp();

    await expectFunctionError(callFunction(client, "secureUniversityRegistration", {
      email: "ada@example.com",
      password: "secret123",
      name: "Ada",
      termsAccepted: true,
      privacyAccepted: true
    }), "permission-denied");
  });

  test("duplicate emails are rejected", async () => {
    await adminApp().auth().createUser({
      uid: "existing-user",
      email: "ada@uab.cat",
      password: "secret123",
      emailVerified: false
    });
    const client = createClientApp();

    await expectFunctionError(callFunction(client, "secureUniversityRegistration", {
      email: "ada@uab.cat",
      password: "secret123",
      name: "Ada",
      termsAccepted: true,
      privacyAccepted: true
    }), "already-exists");
  });

  test("legacy user with acceptedTermsVersion 0.9.0 and backfillTermsVersion execution", async () => {
    const obsoleteUid = "obsolete-user-123";
    const legacyNoVersionUid = "legacy-no-version-456";

    // 1. Create a legacy user with version "0.9.0" in the database
    await adminApp().auth().createUser({
      uid: obsoleteUid,
      email: "obsolete@uab.cat",
      password: "secret123",
      emailVerified: true
    });
    await adminDb().ref(`users/${obsoleteUid}`).set({
      id: obsoleteUid,
      center_id: "uab",
      role: "student",
      email: "obsolete@uab.cat",
      name: "Obsolete User",
      legal: {
        termsAccepted: true,
        privacyAccepted: true,
        acceptedAt: Date.now()
      },
      acceptedTermsVersion: "0.9.0",
      created_at: Date.now(),
      updated_at: Date.now(),
      is_deleted: false
    });

    // 2. Create another user who has NO acceptedTermsVersion at all (legacy profile)
    await adminApp().auth().createUser({
      uid: legacyNoVersionUid,
      email: "legacy@uab.cat",
      password: "secret123",
      emailVerified: true
    });
    await adminDb().ref(`users/${legacyNoVersionUid}`).set({
      id: legacyNoVersionUid,
      center_id: "uab",
      role: "student",
      email: "legacy@uab.cat",
      name: "Legacy User",
      legal: {
        termsAccepted: true,
        privacyAccepted: true,
        acceptedAt: Date.now()
      },
      created_at: Date.now(),
      updated_at: Date.now(),
      is_deleted: false
    });

    // 3. Connect client as the obsolete/legacy user
    let client = createClientApp();
    await signInClient(client, "obsolete@uab.cat");

    // 4. Verify standard read/write rules for their own profile
    const profileSnap = await firebaseDb.get(firebaseDb.ref(client.database, `users/${obsoleteUid}`));
    expect(profileSnap.val().acceptedTermsVersion).toBe("0.9.0");

    // 5. Try to invoke backfillTermsVersion as student (must fail with permission-denied)
    await expectFunctionError(
      callFunction(client, "backfillTermsVersion", {}),
      "permission-denied"
    );

    // 6. Elevate obsolete user to 'admin' using Admin SDK to test successful backfill
    await adminDb().ref(`users/${obsoleteUid}/role`).set("admin");

    // 7. Call backfillTermsVersion as admin (must succeed)
    const result = await callFunction(client, "backfillTermsVersion", {});
    expect(result.data).toEqual({
      success: true,
      processed: 2,
      updated: 1
    });

    // 8. Verify the legacy user was migrated to "0.0.0" and the "0.9.0" user remained unchanged
    const legacySnapAfter = await adminDb().ref(`users/${legacyNoVersionUid}/acceptedTermsVersion`).once("value");
    expect(legacySnapAfter.val()).toBe("0.0.0");

    const obsoleteSnapAfter = await adminDb().ref(`users/${obsoleteUid}/acceptedTermsVersion`).once("value");
    expect(obsoleteSnapAfter.val()).toBe("0.9.0");
  });
});
