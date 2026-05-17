const {
  adminApp,
  adminDb,
  callFunction,
  createClientApp,
  resetEmulators
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
      name: "Ada"
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
      is_deleted: false
    }));
  });

  test("unregistered domains are rejected", async () => {
    const client = createClientApp();

    await expectFunctionError(callFunction(client, "secureUniversityRegistration", {
      email: "ada@example.com",
      password: "secret123",
      name: "Ada"
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
      name: "Ada"
    }), "already-exists");
  });
});
