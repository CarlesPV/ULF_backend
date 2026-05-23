const { setupCallableTestEnv } = require("./helpers/callableTestEnv");
const fs = require("fs");

// Mock sharp at top level
jest.mock("sharp", () => {
    const mSharp = {
        resize: jest.fn().mockReturnThis(),
        toFormat: jest.fn().mockReturnThis(),
        toFile: jest.fn().mockResolvedValue({}),
    };
    return jest.fn(() => mSharp);
});

describe("onImageUploaded trigger", () => {
    let env;
    let bucketMock;

    beforeEach(() => {
        jest.resetModules();
        
        // Mock fs safely
        jest.doMock("fs", () => ({
            ...jest.requireActual("fs"),
            readFileSync: jest.fn().mockReturnValue(Buffer.from("mock content")),
            existsSync: jest.fn().mockReturnValue(true),
            unlinkSync: jest.fn(),
        }));

        env = setupCallableTestEnv({ translateResult: "etiqueta, prueba" });
        
        // Mock Storage
        bucketMock = {
            file: jest.fn((name) => ({
                download: jest.fn().mockResolvedValue([]),
                makePublic: jest.fn().mockResolvedValue([]),
                delete: jest.fn().mockResolvedValue([]),
            })),
            upload: jest.fn().mockResolvedValue([]),
        };
        env.admin.storage = jest.fn(() => ({
            bucket: jest.fn(() => bucketMock)
        }));
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("handlePostImage processes image, generates thumbnail, and updates database with labels and URLs", async () => {
        const { onImageUploaded } = require("../../lib/storage/onImageUploaded");
        
        const event = {
            data: {
                name: "posts/post-1/image-1.jpg",
                bucket: "test-bucket",
                contentType: "image/jpeg"
            }
        };

        await onImageUploaded(event);

        // Verify sharp was called twice (once for main, once for thumbnail)
        const sharp = require("sharp");
        expect(sharp).toHaveBeenCalledTimes(2);

        // Verify uploads were called for main image and thumbnail
        expect(bucketMock.upload).toHaveBeenCalledTimes(2);

        // Verify DB update
        expect(env.writes).toContainEqual({
            op: "update",
            path: "posts/post-1",
            value: expect.objectContaining({
                postImageUrl: expect.stringContaining("https://firebasestorage.googleapis.com/v0/b/test-bucket/o/posts%2Fpost-1%2Fimage-1.jpg?alt=media&token="),
                postThumbnailUrl: expect.stringContaining("https://firebasestorage.googleapis.com/v0/b/test-bucket/o/posts%2Fpost-1%2Fthumb_image-1.jpg?alt=media&token="),
                vision_labels: ["etiqueta", "prueba"]
            })
        });
    });

    test("onImageUploaded ignores webp files in posts/ if already processed or optimized to avoid loops", async () => {
        const { onImageUploaded } = require("../../lib/storage/onImageUploaded");
        const sharp = require("sharp");
        
        const event = {
            data: {
                name: "posts/post-1/image-1.webp",
                contentType: "image/webp",
                metadata: {
                    optimized: "true"
                }
            }
        };

        await onImageUploaded(event);
        expect(sharp).not.toHaveBeenCalled();
    });

    test("onImageUploaded processes webp uploads in posts/ even without processed metadata if not marked optimized", async () => {
        const { onImageUploaded } = require("../../lib/storage/onImageUploaded");

        const event = {
            data: {
                name: "posts/post-1/user_123.webp",
                bucket: "test-bucket",
                contentType: "image/webp",
                metadata: {
                    firebaseStorageDownloadTokens: "client-token"
                }
            }
        };

        await onImageUploaded(event);

        expect(env.writes).toContainEqual({
            op: "update",
            path: "posts/post-1",
            value: expect.objectContaining({
                postImageUrl: expect.stringContaining("https://firebasestorage.googleapis.com/v0/b/test-bucket/o/posts%2Fpost-1%2Fuser_123.webp?alt=media&token="),
                postThumbnailUrl: expect.stringContaining("https://firebasestorage.googleapis.com/v0/b/test-bucket/o/posts%2Fpost-1%2Fthumb_user_123.webp?alt=media&token="),
                vision_labels: ["etiqueta", "prueba"]
            })
        });
    });

    test("onImageUploaded ignores images with optimized metadata", async () => {
        const { onImageUploaded } = require("../../lib/storage/onImageUploaded");
        const sharp = require("sharp");

        const event = {
            data: {
                name: "posts/post-1/image-1.jpg",
                bucket: "test-bucket",
                contentType: "image/jpeg",
                metadata: {
                    optimized: "true"
                }
            }
        };

        await onImageUploaded(event);

        expect(sharp).not.toHaveBeenCalled();
        expect(env.writes).toEqual([]);
    });

    test("onImageUploaded ignores images with processed metadata", async () => {
        const { onImageUploaded } = require("../../lib/storage/onImageUploaded");
        const sharp = require("sharp");

        const event = {
            data: {
                name: "posts/post-1/image-1.jpg",
                bucket: "test-bucket",
                contentType: "image/jpeg",
                metadata: {
                    processed: "true"
                }
            }
        };

        await onImageUploaded(event);

        expect(sharp).not.toHaveBeenCalled();
        expect(env.writes).toEqual([]);
    });

    test("onImageUploaded ignores unrelated storage paths", async () => {
        const { onImageUploaded } = require("../../lib/storage/onImageUploaded");
        const sharp = require("sharp");

        await onImageUploaded({
            data: {
                name: "other/path/image.jpg",
                bucket: "test-bucket",
                contentType: "image/jpeg"
            }
        });

        expect(sharp).not.toHaveBeenCalled();
        expect(bucketMock.upload).not.toHaveBeenCalled();
    });

    test("onImageUploaded ignores invalid post image paths", async () => {
        const { onImageUploaded } = require("../../lib/storage/onImageUploaded");
        const sharp = require("sharp");

        await onImageUploaded({
            data: {
                name: "posts/post-only",
                bucket: "test-bucket",
                contentType: "image/jpeg"
            }
        });

        expect(sharp).not.toHaveBeenCalled();
        expect(bucketMock.upload).not.toHaveBeenCalled();
    });

    test("onImageUploaded handles errors gracefully", async () => {
        const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        bucketMock.file = jest.fn(() => ({
            download: jest.fn().mockRejectedValue(new Error("Download failed"))
        }));

        const { onImageUploaded } = require("../../lib/storage/onImageUploaded");
        const event = {
            data: {
                name: "posts/post-1/image-1.jpg",
                bucket: "test-bucket"
            }
        };

        await onImageUploaded(event);
        expect(errorSpy).toHaveBeenCalled();
    });

    test("handlePostImage stores an empty label list when Vision returns no labels", async () => {
        env.labelDetection.mockResolvedValue([{ labelAnnotations: [] }]);
        const { onImageUploaded } = require("../../lib/storage/onImageUploaded");

        await onImageUploaded({
            data: {
                name: "posts/post-1/image-1.jpg",
                bucket: "test-bucket",
                contentType: "image/jpeg"
            }
        });

        expect(env.writes).toContainEqual({
            op: "update",
            path: "posts/post-1",
            value: expect.objectContaining({
                vision_labels: []
            })
        });
    });

    test("handlePostImage handles Vision failures gracefully", async () => {
        const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        env.labelDetection.mockRejectedValue(new Error("vision failed"));
        const { onImageUploaded } = require("../../lib/storage/onImageUploaded");

        await onImageUploaded({
            data: {
                name: "posts/post-1/image-1.jpg",
                bucket: "test-bucket",
                contentType: "image/jpeg"
            }
        });

        expect(errorSpy).toHaveBeenCalled();
        // Since Vision failed, it should still have optimized and uploaded the image, and updated RTDB with URLs
        expect(env.writes).toContainEqual({
            op: "update",
            path: "posts/post-1",
            value: expect.objectContaining({
                postImageUrl: expect.any(String),
                postThumbnailUrl: expect.any(String)
            })
        });
    });

    test("handlePostImage cleans up temporary files", async () => {
        const fs = require("fs");
        const { onImageUploaded } = require("../../lib/storage/onImageUploaded");

        await onImageUploaded({
            data: {
                name: "posts/post-1/image-1.jpg",
                bucket: "test-bucket",
                contentType: "image/jpeg"
            }
        });

        expect(fs.unlinkSync).toHaveBeenCalled();
    });
});
