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
    description: "Mochila escolar de color rojo.",
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

  test("users can write their own settings and preferredLanguage", async () => {
    const userUid = "user-settings-1";
    await createVerifiedUser({
      uid: userUid,
      email: "settings@uab.cat"
    });
    await adminDb().ref(`users/${userUid}`).set({
      id: userUid,
      center_id: "uab",
      role: "student",
      email: "settings@uab.cat",
      name: "Test User",
      legal: {
        termsAccepted: true,
        privacyAccepted: true,
        acceptedAt: Date.now()
      },
      created_at: Date.now(),
      updated_at: Date.now(),
      is_deleted: false
    });

    const client = await signInClient(createClientApp(), "settings@uab.cat");

    await expect(firebaseDb.set(
      firebaseDb.ref(client.database, `users/${userUid}/preferredLanguage`),
      "es"
    )).resolves.toBeUndefined();

    await expect(firebaseDb.set(
      firebaseDb.ref(client.database, `users/${userUid}/settings`),
      {
        language: "en",
        push_notifications: true,
        dark_mode: false
      }
    )).resolves.toBeUndefined();

    await expectPermissionDenied(firebaseDb.set(
      firebaseDb.ref(client.database, "users/other-user/preferredLanguage"),
      "es"
    ));
  });

  test("empty strings are rejected on critical user profile fields", async () => {
    const userUid = "user-empty-fields-1";
    await createVerifiedUser({
      uid: userUid,
      email: "emptyfields@uab.cat"
    });
    
    // Configuración inicial del usuario
    await adminDb().ref(`users/${userUid}`).set({
      id: userUid,
      center_id: "uab",
      role: "student",
      email: "emptyfields@uab.cat",
      name: "Test User",
      legal: {
        termsAccepted: true,
        privacyAccepted: true,
        acceptedAt: Date.now()
      },
      created_at: Date.now(),
      updated_at: Date.now(),
      is_deleted: false
    });

    const client = await signInClient(createClientApp(), "emptyfields@uab.cat");

    // Intentar escribir un nombre vacío
    await expectPermissionDenied(firebaseDb.set(
      firebaseDb.ref(client.database, `users/${userUid}/name`),
      ""
    ));

    // Intentar escribir un email vacío
    await expectPermissionDenied(firebaseDb.set(
      firebaseDb.ref(client.database, `users/${userUid}/email`),
      ""
    ));

    // Intentar escribir un id vacío
    await expectPermissionDenied(firebaseDb.set(
      firebaseDb.ref(client.database, `users/${userUid}/id`),
      ""
    ));
  });

  test("direct database writes to posts are blocked for clients", async () => {
    await createVerifiedUser({
      uid: "owner-1",
      email: "owner@uab.cat"
    });
    const client = await signInClient(createClientApp(), "owner@uab.cat");

    const postRef = firebaseDb.ref(client.database, "posts/post-write-test");

    // Intentar crear un post directamente
    await expectPermissionDenied(firebaseDb.set(postRef, validPost("post-write-test", "owner-1")));

    // Intentar actualizar un post existente directamente
    await adminDb().ref("posts/post-write-test").set(validPost("post-write-test", "owner-1"));
    await expectPermissionDenied(firebaseDb.set(postRef, {
      ...validPost("post-write-test", "owner-1"),
      title: "Mochila cambiada"
    }));
  });

  test("Admin SDK can still mark posts as rejected for backend triggers", async () => {
    await adminDb().ref("posts/post-admin-rejected").set(validPost("post-admin-rejected", "owner-1"));

    await expect(adminDb().ref("posts/post-admin-rejected").update({
      status: "rejected",
      updated_at: Date.now()
    })).resolves.toBeUndefined();

    const snap = await adminDb().ref("posts/post-admin-rejected/status").once("value");
    expect(snap.val()).toBe("rejected");
  });

  test("users can write and validate their legal node", async () => {
    const userUid = "user-legal-1";
    await createVerifiedUser({
      uid: userUid,
      email: "legal@uab.cat"
    });
    await adminDb().ref(`users/${userUid}`).set({
      id: userUid,
      center_id: "uab",
      role: "student",
      email: "legal@uab.cat",
      name: "Test User",
      legal: {
        termsAccepted: true,
        privacyAccepted: true,
        acceptedAt: Date.now()
      },
      created_at: Date.now(),
      updated_at: Date.now(),
      is_deleted: false
    });

    const client = await signInClient(createClientApp(), "legal@uab.cat");

    // Write a valid legal node
    await expect(firebaseDb.set(
      firebaseDb.ref(client.database, `users/${userUid}/legal`),
      {
        termsAccepted: true,
        privacyAccepted: true,
        acceptedAt: Date.now()
      }
    )).resolves.toBeUndefined();

    // Write an invalid legal node (missing acceptedAt)
    await expectPermissionDenied(firebaseDb.set(
      firebaseDb.ref(client.database, `users/${userUid}/legal`),
      {
        termsAccepted: true,
        privacyAccepted: true
      }
    ));

    // Write an invalid legal node (extra field)
    await expectPermissionDenied(firebaseDb.set(
      firebaseDb.ref(client.database, `users/${userUid}/legal`),
      {
        termsAccepted: true,
        privacyAccepted: true,
        acceptedAt: Date.now(),
        hack: "malicious"
      }
    ));

    // Write to another user's legal node
    await expectPermissionDenied(firebaseDb.set(
      firebaseDb.ref(client.database, "users/other-user/legal"),
      {
        termsAccepted: true,
        privacyAccepted: true,
        acceptedAt: Date.now()
      }
    ));
  });

  test("users can write and validate their acceptedTermsVersion", async () => {
    const userUid = "user-terms-1";
    await createVerifiedUser({
      uid: userUid,
      email: "terms@uab.cat"
    });
    await adminDb().ref(`users/${userUid}`).set({
      id: userUid,
      center_id: "uab",
      role: "student",
      email: "terms@uab.cat",
      name: "Test User",
      legal: {
        termsAccepted: true,
        privacyAccepted: true,
        acceptedAt: Date.now()
      },
      created_at: Date.now(),
      updated_at: Date.now(),
      is_deleted: false
    });

    const client = await signInClient(createClientApp(), "terms@uab.cat");

    // 1. Write a valid semantic version to own profile (success)
    await expect(firebaseDb.set(
      firebaseDb.ref(client.database, `users/${userUid}/acceptedTermsVersion`),
      "1.0.3"
    )).resolves.toBeUndefined();

    // 2. Write an invalid version format to own profile (fails)
    await expectPermissionDenied(firebaseDb.set(
      firebaseDb.ref(client.database, `users/${userUid}/acceptedTermsVersion`),
      "1.0"
    ));
    await expectPermissionDenied(firebaseDb.set(
      firebaseDb.ref(client.database, `users/${userUid}/acceptedTermsVersion`),
      "1.0.a"
    ));
    await expectPermissionDenied(firebaseDb.set(
      firebaseDb.ref(client.database, `users/${userUid}/acceptedTermsVersion`),
      ""
    ));

    // 3. Setup user B
    const userUidB = "user-terms-2";
    await createVerifiedUser({
      uid: userUidB,
      email: "termsb@uab.cat"
    });
    await adminDb().ref(`users/${userUidB}`).set({
      id: userUidB,
      center_id: "uab",
      role: "student",
      email: "termsb@uab.cat",
      name: "Test User B",
      legal: {
        termsAccepted: true,
        privacyAccepted: true,
        acceptedAt: Date.now()
      },
      acceptedTermsVersion: "2.0.0",
      created_at: Date.now(),
      updated_at: Date.now(),
      is_deleted: false
    });

    // 4. Try to write to another user's acceptedTermsVersion (fails)
    await expectPermissionDenied(firebaseDb.set(
      firebaseDb.ref(client.database, `users/${userUidB}/acceptedTermsVersion`),
      "3.0.0"
    ));

    // 5. Try to read another user's acceptedTermsVersion (fails)
    await expectPermissionDenied(firebaseDb.get(
      firebaseDb.ref(client.database, `users/${userUidB}/acceptedTermsVersion`)
    ));
  });
});
