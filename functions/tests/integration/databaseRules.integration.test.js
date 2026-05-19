const {
  adminDb,
  createClientApp,
  createVerifiedUser,
  expectPermissionDenied,
  firebaseDb,
  resetEmulators,
  signInClient
} = require("./helpers/firebaseEmulatorTestEnv");

function validPost(id, userId = "owner-1") {
  return {
    id,
    user_id: userId,
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
  };
}

describe("integration: Realtime Database rules", () => {
  beforeEach(async () => {
    await resetEmulators();
  });

  test("unverified users cannot write posts", async () => {
    await createVerifiedUser({
      uid: "unverified-1",
      email: "unverified@uab.cat",
      emailVerified: false
    });
    const client = await signInClient(createClientApp(), "unverified@uab.cat");

    await expectPermissionDenied(firebaseDb.set(
      firebaseDb.ref(client.database, "posts/post-denied"),
      validPost("post-denied", "unverified-1")
    ));
  });

  test("non-members cannot read chat messages", async () => {
    await createVerifiedUser({
      uid: "member-1",
      email: "member@uab.cat"
    });
    await createVerifiedUser({
      uid: "outsider-1",
      email: "outsider@uab.cat"
    });
    await adminDb().ref().update({
      "chats/chat-1": {
        id: "chat-1",
        center_id: "uab",
        post_id: "post-1",
        members: {
          "member-1": true
        },
        created_at: Date.now()
      },
      "messages/chat-1/message-1": {
        id: "message-1",
        sender_id: "member-1",
        text: "Privado",
        timestamp: Date.now()
      }
    });
    const client = await signInClient(createClientApp(), "outsider@uab.cat");

    await expectPermissionDenied(firebaseDb.get(
      firebaseDb.ref(client.database, "messages/chat-1/message-1")
    ));
  });

  test("users can write only their own post view entry", async () => {
    await createVerifiedUser({
      uid: "owner-1",
      email: "owner@uab.cat"
    });
    await createVerifiedUser({
      uid: "viewer-1",
      email: "viewer@uab.cat"
    });
    await adminDb().ref("posts/post-1").set(validPost("post-1", "owner-1"));
    const viewerClient = await signInClient(createClientApp(), "viewer@uab.cat");

    await expect(firebaseDb.set(
      firebaseDb.ref(viewerClient.database, "post_views/post-1/viewer-1"),
      { timestamp: Date.now() }
    )).resolves.toBeUndefined();

    await expectPermissionDenied(firebaseDb.set(
      firebaseDb.ref(viewerClient.database, "post_views/post-1/other-user"),
      { timestamp: Date.now() }
    ));

    const ownerClient = await signInClient(createClientApp(), "owner@uab.cat");

    await expectPermissionDenied(firebaseDb.set(
      firebaseDb.ref(ownerClient.database, "post_views/post-1/owner-1"),
      { timestamp: Date.now() }
    ));
  });
});
