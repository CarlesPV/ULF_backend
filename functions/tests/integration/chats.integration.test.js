const {
  adminDb,
  callFunction,
  createClientApp,
  createVerifiedUser,
  firebaseDb,
  resetEmulators,
  signInClient,
  waitFor
} = require("./helpers/firebaseEmulatorTestEnv");

describe("integration: chats and messages", () => {
  beforeEach(async () => {
    await resetEmulators();
  });

  test("getOrCreateChat creates chat indexes and onMessageCreated updates chat metadata", async () => {
    await createVerifiedUser({
      uid: "owner-1",
      email: "owner@uab.cat",
      name: "Owner"
    });
    await createVerifiedUser({
      uid: "requester-1",
      email: "requester@uab.cat",
      name: "Requester"
    });
    await adminDb().ref("posts/post-1").set({
      id: "post-1",
      user_id: "owner-1",
      center_id: "uab",
      type: "lost",
      title: "Mochila roja",
      description: "",
      category: "bags",
      status: "active",
      coords: {
        lat: 41.5008587,
        lng: 2.1042399,
        geohash: "sp3e"
      },
      photo_path: "",
      created_at: Date.now(),
      updated_at: Date.now(),
      is_deleted: false
    });
    const client = await signInClient(createClientApp(), "requester@uab.cat");

    const result = await callFunction(client, "getOrCreateChat", {
      postId: "post-1",
      postOwnerId: "owner-1",
      centerId: "uab",
      postTitle: "Mochila fallback"
    });

    const chatId = result.data.chatId;
    expect(chatId).toEqual(expect.any(String));
    await waitFor(async () => {
      const requesterIndex = await adminDb().ref(`user_chats/requester-1/${chatId}`).once("value");
      const ownerIndex = await adminDb().ref(`user_chats/owner-1/${chatId}`).once("value");
      return requesterIndex.exists() && ownerIndex.exists();
    });

    await firebaseDb.set(firebaseDb.ref(client.database, `messages/${chatId}/message-1`), {
      id: "message-1",
      sender_id: "requester-1",
      text: "Hola, sigue disponible?",
      timestamp: Date.now()
    });

    await waitFor(async () => {
      const chatSnap = await adminDb().ref(`chats/${chatId}`).once("value");
      return chatSnap.val()?.last_message === "Hola, sigue disponible?" && chatSnap.val();
    });

    const chatSnap = await adminDb().ref(`chats/${chatId}`).once("value");
    expect(chatSnap.val()).toEqual(expect.objectContaining({
      post_id: "post-1",
      postTitle: "Mochila roja",
      last_message: "Hola, sigue disponible?",
      last_message_time: expect.any(Number)
    }));
  });

  test("reactivates disabled chats when post goes from returned back to active", async () => {
    await createVerifiedUser({
      uid: "owner-1",
      email: "owner@uab.cat",
      name: "Owner"
    });
    await createVerifiedUser({
      uid: "requester-1",
      email: "requester@uab.cat",
      name: "Requester"
    });
    
    const postRef = adminDb().ref("posts/post-reactivate");
    await postRef.set({
      id: "post-reactivate",
      user_id: "owner-1",
      center_id: "uab",
      type: "lost",
      title: "Mochila reactivar",
      category: "bags",
      status: "active",
      coords: {
        lat: 41.5008587,
        lng: 2.1042399
      },
      created_at: Date.now(),
      updated_at: Date.now(),
      is_deleted: false
    });

    const client = await signInClient(createClientApp(), "requester@uab.cat");
    const result = await callFunction(client, "getOrCreateChat", {
      postId: "post-reactivate",
      postOwnerId: "owner-1",
      centerId: "uab",
      postTitle: "Mochila reactivar"
    });

    const chatId = result.data.chatId;
    expect(chatId).toEqual(expect.any(String));

    // Desactivar: Cambiar status a returned
    await postRef.update({
      status: "returned",
      updated_at: Date.now()
    });

    await waitFor(async () => {
      const chatSnap = await adminDb().ref(`chats/${chatId}`).once("value");
      return chatSnap.val()?.isActive === false && chatSnap.val()?.disabledReason === "resolved";
    });

    // Reactivar: Cambiar status a active
    await postRef.update({
      status: "active",
      updated_at: Date.now()
    });

    await waitFor(async () => {
      const chatSnap = await adminDb().ref(`chats/${chatId}`).once("value");
      const val = chatSnap.val();
      return val?.isActive === true && (val?.disabledReason === undefined || val?.disabledReason === null);
    });

    const finalChatSnap = await adminDb().ref(`chats/${chatId}`).once("value");
    expect(finalChatSnap.val().isActive).toBe(true);
    expect(finalChatSnap.val().disabledReason).toBeUndefined();
  });
});

