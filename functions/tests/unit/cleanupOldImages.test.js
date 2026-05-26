const { setupCallableTestEnv } = require("./helpers/callableTestEnv");

describe("cleanupOldImages scheduler", () => {
    test("deletes expired queued images from storage and removes the documents", async () => {
        jest.spyOn(console, "log").mockImplementation(() => {});
        const now = Date.parse("2026-05-15T00:00:00.000Z");
        jest.spyOn(Date, "now").mockReturnValue(now);

        const expiredUrl = "https://firebasestorage.googleapis.com/v0/b/test-bucket/o/posts%2Fpost-1%2Fimage.jpg?alt=media";
        
        const env = setupCallableTestEnv({
            firestoreDocs: {
                pending_image_deletions: [
                    {
                        id: "doc-expired",
                        data: {
                            imageUrl: expiredUrl,
                            scheduledDeletionTime: {
                                toMillis: () => now - 1000
                            }
                        }
                    },
                    {
                        id: "doc-invalid-no-url",
                        data: {
                            scheduledDeletionTime: {
                                toMillis: () => now - 2000
                            }
                        }
                    }
                ]
            }
        });

        const { cleanupOldImages } = require("../../lib/maintenance/cleanupOldImages");

        await cleanupOldImages({});

        // Assert Storage file delete was called
        expect(env.storageFileMock).toHaveBeenCalledWith("posts/post-1/image.jpg");
        expect(env.storageFileDeleteMock).toHaveBeenCalledTimes(1);

        // Assert Firestore delete writes occurred for both documents
        expect(env.firestoreWrites).toContainEqual({
            op: "delete",
            collection: "pending_image_deletions",
            id: "doc-expired"
        });
        expect(env.firestoreWrites).toContainEqual({
            op: "delete",
            collection: "pending_image_deletions",
            id: "doc-invalid-no-url"
        });
    });

    test("logs errors and completes without throwing", async () => {
        const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        const env = setupCallableTestEnv({});
        
        env.admin.firestore = jest.fn(() => {
            throw new Error("firestore offline");
        });

        const { cleanupOldImages } = require("../../lib/maintenance/cleanupOldImages");

        await expect(cleanupOldImages({})).resolves.toBeUndefined();
        expect(errorSpy).toHaveBeenCalled();
    });
});
