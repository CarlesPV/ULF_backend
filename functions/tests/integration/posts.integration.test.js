const {
  adminDb,
  callFunction,
  createClientApp,
  createVerifiedUser,
  resetEmulators,
  signInClient,
  waitFor,
  firebaseStorage
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

  test("verified user edits post and old image is deleted after 1 hour via cron", async () => {
    await createVerifiedUser({
      uid: "user-1",
      email: "poster@uab.cat"
    });
    const client = await signInClient(createClientApp(), "poster@uab.cat");

    // 1. Create a post
    const createResult = await callFunction(client, "createPostReport", {
      center_id: "uab",
      type: "lost",
      title: "Mochila roja",
      category: "bags",
      lat: 41.5008587,
      lng: 2.1042399
    });
    const postId = createResult.data.post_id;

    // 2. Upload a file to storage and set as post's imageUrl
    const fileRef = firebaseStorage.ref(client.storage, `posts/${postId}/old_image.jpg`);
    await firebaseStorage.uploadBytes(fileRef, Buffer.from("mock image data"), { contentType: "image/jpeg" });
    const oldUrl = `https://firebasestorage.googleapis.com/v0/b/demo-ulf.appspot.com/o/posts%2F${postId}%2Fold_image.jpg?alt=media`;

    await adminDb().ref(`posts/${postId}`).update({ imageUrl: oldUrl });

    // 3. Update the post with a new image URL using updatePost
    const newUrl = `https://firebasestorage.googleapis.com/v0/b/demo-ulf.appspot.com/o/posts%2F${postId}%2Fnew_image.jpg?alt=media`;
    await callFunction(client, "updatePost", {
      postId,
      updates: { imageUrl: newUrl }
    });

    // 4. Verify post database was updated
    const postSnap = await adminDb().ref(`posts/${postId}`).once("value");
    expect(postSnap.val().imageUrl).toBe(newUrl);

    // 5. Verify the deletion was scheduled
    const deletionsSnap = await adminDb().ref("scheduled_deletions").once("value");
    expect(deletionsSnap.exists()).toBe(true);

    const deletionKey = Object.keys(deletionsSnap.val())[0];
    const deletionRecord = deletionsSnap.val()[deletionKey];
    expect(deletionRecord.path).toBe(`posts/${postId}/old_image.jpg`);
  });
});
