const { setupCallableTestEnv } = require("./helpers/callableTestEnv");

// Mock sharp at top level
jest.mock("sharp", () => {
    const mSharp = {
        resize: jest.fn().mockReturnThis(),
        toFormat: jest.fn().mockReturnThis(),
        toFile: jest.fn().mockResolvedValue({}),
    };
    return jest.fn(() => mSharp);
});

// Mock fs safely
jest.mock("fs", () => ({
    ...jest.requireActual("fs"),
    existsSync: jest.fn().mockReturnValue(true),
    unlinkSync: jest.fn(),
}));

describe("onProfileImageUploaded trigger", () => {
    let env;
    let bucketMock;
    let fileMock;

    beforeEach(() => {
        jest.resetModules();
        env = setupCallableTestEnv();

        fileMock = {
            download: jest.fn().mockResolvedValue([]),
        };

        bucketMock = {
            file: jest.fn(() => fileMock),
            upload: jest.fn().mockResolvedValue([]),
        };

        env.admin.storage = jest.fn(() => ({
            bucket: jest.fn(() => bucketMock)
        }));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("onProfileImageUploaded generates a download token, optimizes image, and updates Realtime Database", async () => {
        const { onProfileImageUploaded } = require("../../lib/storage/onProfileImageUploaded");

        const event = {
            data: {
                name: "users/user_123/profile_image",
                bucket: "test-bucket",
                metadata: {}
            }
        };

        await onProfileImageUploaded(event);

        // Verify sharp was called
        const sharp = require("sharp");
        expect(sharp).toHaveBeenCalled();

        // Verify upload was called with a new UUID and correct cache-control
        expect(bucketMock.upload).toHaveBeenCalledWith(
            expect.stringContaining("opt_profile_user_123"),
            expect.objectContaining({
                destination: "users/user_123/profile_image",
                metadata: expect.objectContaining({
                    contentType: "image/webp",
                    cacheControl: "public, max-age=31536000, s-maxage=31536000",
                    metadata: expect.objectContaining({
                        optimized: "true",
                        firebaseStorageDownloadTokens: expect.any(String)
                    })
                })
            })
        );

        // Verify database update
        expect(env.writes).toContainEqual({
            op: "update",
            path: "users/user_123",
            value: expect.objectContaining({
                photoUrl: expect.stringMatching(/https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/test-bucket\/o\/users%2Fuser_123%2Fprofile_image\?alt=media&token=[a-f0-9-]+\&v=\d+/),
                photoUpdatedAt: expect.any(Number),
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

        // Verify upload reuses the token
        expect(bucketMock.upload).toHaveBeenCalledWith(
            expect.stringContaining("opt_profile_user_123"),
            expect.objectContaining({
                destination: "users/user_123/profile_image",
                metadata: expect.objectContaining({
                    contentType: "image/webp",
                    cacheControl: "public, max-age=31536000, s-maxage=31536000",
                    metadata: expect.objectContaining({
                        optimized: "true",
                        firebaseStorageDownloadTokens: "existing-token-uuid"
                    })
                })
            })
        );

        // Verify database update with the existing token
        expect(env.writes).toContainEqual({
            op: "update",
            path: "users/user_123",
            value: expect.objectContaining({
                photoUrl: expect.stringMatching(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/test-bucket\/o\/users%2Fuser_123%2Fprofile_image\?alt=media&token=existing-token-uuid&v=\d+$/),
                photoUpdatedAt: expect.any(Number),
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

        expect(bucketMock.upload).not.toHaveBeenCalled();
        expect(env.writes).toEqual([]);
    });
});
