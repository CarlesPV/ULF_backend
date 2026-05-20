const {
  createClientApp,
  createVerifiedUser,
  expectPermissionDenied,
  firebaseStorage,
  resetEmulators,
  signInClient
} = require("./helpers/firebaseEmulatorTestEnv");

describe("integration: Storage rules", () => {
  beforeEach(async () => {
    await resetEmulators();
  });

  test("unauthenticated users cannot upload post images", async () => {
    const client = createClientApp();
    const storageRef = firebaseStorage.ref(client.storage, "posts/post-1/image.jpg");
    const data = Buffer.from("mock image data");

    await expectPermissionDenied(
      firebaseStorage.uploadBytes(storageRef, data, { contentType: "image/jpeg" })
    );
  });

  test("authenticated users can upload jpeg/png/webp under 5MB", async () => {
    await createVerifiedUser({
      uid: "user-1",
      email: "user1@uab.cat"
    });
    const client = await signInClient(createClientApp(), "user1@uab.cat");
    
    // jpeg
    const jpegRef = firebaseStorage.ref(client.storage, "posts/post-1/image.jpg");
    await expect(
      firebaseStorage.uploadBytes(jpegRef, Buffer.from("mock image data"), { contentType: "image/jpeg" })
    ).resolves.toBeDefined();

    // png
    const pngRef = firebaseStorage.ref(client.storage, "posts/post-1/image.png");
    await expect(
      firebaseStorage.uploadBytes(pngRef, Buffer.from("mock image data"), { contentType: "image/png" })
    ).resolves.toBeDefined();

    // webp
    const webpRef = firebaseStorage.ref(client.storage, "posts/post-1/image.webp");
    await expect(
      firebaseStorage.uploadBytes(webpRef, Buffer.from("mock image data"), { contentType: "image/webp" })
    ).resolves.toBeDefined();
  });

  test("authenticated users cannot upload invalid content types or size > 5MB", async () => {
    await createVerifiedUser({
      uid: "user-1",
      email: "user1@uab.cat"
    });
    const client = await signInClient(createClientApp(), "user1@uab.cat");

    // Invalid content type
    const txtRef = firebaseStorage.ref(client.storage, "posts/post-1/test.txt");
    await expectPermissionDenied(
      firebaseStorage.uploadBytes(txtRef, Buffer.from("mock text data"), { contentType: "text/plain" })
    );

    // Large file (6MB)
    const largeRef = firebaseStorage.ref(client.storage, "posts/post-1/large.jpg");
    const largeData = Buffer.alloc(6 * 1024 * 1024); // 6MB
    await expectPermissionDenied(
      firebaseStorage.uploadBytes(largeRef, largeData, { contentType: "image/jpeg" })
    );
  });
});
