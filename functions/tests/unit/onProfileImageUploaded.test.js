const { setupCallableTestEnv } = require("./helpers/callableTestEnv");

describe("onProfileImageUploaded trigger", () => {
    let env;
    let bucketMock;
    let fileMock;

    beforeEach(() => {
        jest.resetModules();
        env = setupCallableTestEnv();

        fileMock = {
            setMetadata: jest.fn().mockResolvedValue([]),
        };

        bucketMock = {
            file: jest.fn(() => fileMock),
        };

        env.admin.storage = jest.fn(() => ({
            bucket: jest.fn(() => bucketMock)
        }));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("onProfileImageUploaded generates a download token and updates Realtime Database", async () => {
        const { onProfileImageUploaded } = require("../../lib/storage/onProfileImageUploaded");

        const event = {
            data: {
                name: "users/user_123/profile_image",
                bucket: "test-bucket",
                metadata: {}
            }
        };

        await onProfileImageUploaded(event);

        // Verify setMetadata was called with a new UUID
        expect(fileMock.setMetadata).toHaveBeenCalledWith({
            metadata: {
                firebaseStorageDownloadTokens: expect.any(String)
            }
        });

        // Verify database update
        expect(env.writes).toContainEqual({
            op: "update",
            path: "users/user_123",
            value: expect.objectContaining({
                photoUrl: expect.stringContaining("https://firebasestorage.googleapis.com/v0/b/test-bucket/o/users%2Fuser_123%2Fprofile_image?alt=media&token="),
                updated_at: expect.any(Number)
            })
        });
    });

    test("onProfileImageUploaded reuses existing download token if present in metadata", async () => {
        const { onProfileImageUploaded } = require("../../lib/storage/onProfileImageUploaded");

        const event = {
            data: {
                name: "users/user_123/profile_image",
                bucket: "test-bucket",
                metadata: {
                    firebaseStorageDownloadTokens: "existing-token-uuid"
                }
            }
        };

        await onProfileImageUploaded(event);

        // Verify setMetadata was NOT called
        expect(fileMock.setMetadata).not.toHaveBeenCalled();

        // Verify database update with the existing token
        expect(env.writes).toContainEqual({
            op: "update",
            path: "users/user_123",
            value: expect.objectContaining({
                photoUrl: "https://firebasestorage.googleapis.com/v0/b/test-bucket/o/users%2Fuser_123%2Fprofile_image?alt=media&token=existing-token-uuid",
                updated_at: expect.any(Number)
            })
        });
    });

    test("onProfileImageUploaded ignores unrelated storage paths", async () => {
        const { onProfileImageUploaded } = require("../../lib/storage/onProfileImageUploaded");

        const event = {
            data: {
                name: "posts/post-1/image.webp",
                bucket: "test-bucket",
                metadata: {}
            }
        };

        await onProfileImageUploaded(event);

        expect(fileMock.setMetadata).not.toHaveBeenCalled();
        expect(env.writes).toEqual([]);
    });
});
