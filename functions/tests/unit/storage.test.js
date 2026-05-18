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

    test("handlePostImage optimizes image and updates database", async () => {
        const { onImageUploaded } = require("../../lib/storage/onImageUploaded");
        
        const event = {
            data: {
                name: "posts/post-1/image-1.jpg",
                bucket: "test-bucket",
                contentType: "image/jpeg"
            }
        };

        await onImageUploaded(event);

        // Verify sharp was called
        const sharp = require("sharp");
        expect(sharp).toHaveBeenCalled();
        expect(sharp().resize).toHaveBeenCalledWith(1080, 1080, expect.any(Object));

        // Verify original deletion
        expect(bucketMock.file).toHaveBeenCalledWith("posts/post-1/image-1.jpg");

        // Verify upload was called
        expect(bucketMock.upload).toHaveBeenCalledWith(
            expect.stringContaining("opt_post-1"),
            expect.objectContaining({ 
                destination: "posts/post-1/image-1.jpg.webp",
                metadata: expect.objectContaining({ contentType: "image/webp" })
            })
        );

        // Verify DB update
        expect(env.writes).toContainEqual({
            op: "update",
            path: "posts/post-1",
            value: expect.objectContaining({
                imageUrl: expect.stringContaining("image-1.jpg.webp"),
                vision_labels: ["etiqueta", "prueba"]
            })
        });
    });

    test("onImageUploaded ignores webp files in posts/ to avoid loops", async () => {
        const { onImageUploaded } = require("../../lib/storage/onImageUploaded");
        const sharp = require("sharp");
        
        const event = {
            data: {
                name: "posts/post-1/image-1.webp",
                contentType: "image/webp",
                metadata: {
                    processed: "true"
                }
            }
        };

        await onImageUploaded(event);
        expect(sharp).not.toHaveBeenCalled();
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

    test("onImageUploaded ignores profile webp files to avoid loops", async () => {
        const { onImageUploaded } = require("../../lib/storage/onImageUploaded");
        const sharp = require("sharp");

        await onImageUploaded({
            data: {
                name: "users/user_abc/profile_image",
                bucket: "test-bucket",
                contentType: "image/webp"
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
        expect(env.writes).toEqual([]);
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

        expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
    });

    test("handleProfileImage optimizes image and updates user profile with timestamp", async () => {
        const { onImageUploaded } = require("../../lib/storage/onImageUploaded");
        
        const event = {
            data: {
                name: "users/user_abc/profile_image",
                bucket: "test-bucket",
                contentType: "image/jpeg"
            }
        };

        await onImageUploaded(event);

        // Verify upload with cache control
        expect(bucketMock.upload).toHaveBeenCalledWith(
            expect.stringContaining("optimized_user_abc"),
            expect.objectContaining({ 
                destination: "users/user_abc/profile_image.webp",
                metadata: expect.objectContaining({ 
                    contentType: "image/webp",
                    cacheControl: "public, max-age=3600, s-maxage=3600"
                })
            })
        );

        // Verify DB update includes photoUrl with timestamp and photoUpdatedAt
        expect(env.writes).toContainEqual({
            op: "update",
            path: "users/user_abc",
            value: expect.objectContaining({
                photoUrl: expect.stringContaining("&t="),
                photoUpdatedAt: expect.any(Number)
            })
        });
    });

    test("handleProfileImage handles dynamic filenames with timestamp and webp format", async () => {
        const { onImageUploaded } = require("../../lib/storage/onImageUploaded");
        
        const event = {
            data: {
                name: "users/user_abc/user_abc_1715432020.webp",
                bucket: "test-bucket",
                contentType: "image/webp"
            }
        };

        await onImageUploaded(event);

        expect(bucketMock.upload).toHaveBeenCalledWith(
            expect.stringContaining("optimized_user_abc"),
            expect.objectContaining({ 
                destination: "users/user_abc/profile_image.webp",
                metadata: expect.objectContaining({ 
                    contentType: "image/webp",
                    cacheControl: "public, max-age=3600, s-maxage=3600"
                })
            })
        );
    });
});
