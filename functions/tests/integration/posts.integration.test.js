const {
  adminDb,
  callFunction,
  createClientApp,
  createVerifiedUser,
  resetEmulators,
  signInClient,
  waitFor
} = require("./helpers/firebaseEmulatorTestEnv");

async function expectFunctionError(promise, code) {
  try {
    await promise;
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect(error.code).toBe(`functions/${code}`);
  }
}

describe("integration: post creation and active index", () => {
  beforeEach(async () => {
    await resetEmulators();
  });

  test("verified user creates a valid post and the trigger indexes it as active", async () => {
    await createVerifiedUser({
      uid: "user-1",
      email: "poster@uab.cat"
    });
    const client = await signInClient(createClientApp(), "poster@uab.cat");

    const result = await callFunction(client, "createPostReport", {
      center_id: "uab",
      type: "lost",
      title: "Mochila roja",
      category: "bags",
      lat: 41.5008587,
      lng: 2.1042399
    });

    expect(result.data).toEqual({
      success: true,
      post_id: expect.any(String)
    });

    const postId = result.data.post_id;
    const postSnap = await adminDb().ref(`posts/${postId}`).once("value");
    expect(postSnap.val()).toEqual(expect.objectContaining({
      id: postId,
      user_id: "user-1",
      center_id: "uab",
      type: "lost",
      category: "bags",
      status: "active"
    }));

    await waitFor(async () => {
      const activeSnap = await adminDb().ref(`active_posts/uab/${postId}`).once("value");
      return activeSnap.exists() && activeSnap.val();
    });
  });

  test("out-of-campus coordinates are rejected", async () => {
    await createVerifiedUser({
      uid: "user-1",
      email: "poster@uab.cat"
    });
    const client = await signInClient(createClientApp(), "poster@uab.cat");

    await expectFunctionError(callFunction(client, "createPostReport", {
      center_id: "uab",
      type: "found",
      title: "Objeto lejos",
      category: "others",
      lat: 40.0,
      lng: 2.0
    }), "out-of-range");

    const postsSnap = await adminDb().ref("posts").once("value");
    expect(postsSnap.exists()).toBe(false);
  });
});
