const { setupCallableTestEnv } = require("./helpers/callableTestEnv");

function adminRequest() {
    return {
        auth: {
            uid: "admin-uid"
        }
    };
}

describe("purgeOrphanFields HTTPS Callable", () => {
    test("rejects unauthenticated requests", async () => {
        setupCallableTestEnv();
        const { purgeOrphanFields } = require("../../lib/maintenance/purgeOrphanFields");

        await expect(purgeOrphanFields({})).rejects.toMatchObject({
            code: "unauthenticated"
        });
    });

    test("rejects non-admin requests", async () => {
        setupCallableTestEnv({
            onceByPath: {
                "users/user-uid/role": "student"
            }
        });
        const { purgeOrphanFields } = require("../../lib/maintenance/purgeOrphanFields");

        await expect(purgeOrphanFields({ auth: { uid: "user-uid" } })).rejects.toMatchObject({
            code: "permission-denied"
        });
    });

    test("identifies and purges obsolete/orphan fields in users and posts", async () => {
        jest.spyOn(console, "log").mockImplementation(() => {});
        const env = setupCallableTestEnv({
            onceByPath: {
                "users/admin-uid/role": "admin",
                "users": {
                    "user-clean": {
                        id: "user-clean",
                        center_id: "uab",
                        role: "student",
                        email: "clean@uab.cat",
                        name: "Clean"
                    },
                    "user-dirty": {
                        id: "user-dirty",
                        center_id: "uab",
                        role: "student",
                        email: "dirty@uab.cat",
                        name: "Dirty",
                        photo_path: "legacy/path.jpg",
                        settings: {
                            push_notifications: true,
                            dark_mode: false,
                            isDarkMode: false,
                            pushNotificationsEnabled: true
                        }
                    }
                },
                "posts": {
                    "post-clean": {
                        id: "post-clean",
                        user_id: "user-clean",
                        center_id: "uab",
                        type: "lost",
                        title: "Clean Post"
                    },
                    "post-dirty": {
                        id: "post-dirty",
                        user_id: "user-dirty",
                        center_id: "uab",
                        type: "lost",
                        title: "Dirty Post",
                        photo_path: "legacy/post/path.jpg"
                    }
                }
            }
        });

        const { purgeOrphanFields } = require("../../lib/maintenance/purgeOrphanFields");

        const result = await purgeOrphanFields(adminRequest());

        expect(result).toEqual({
            success: true,
            users: { processed: 2, updated: 1 },
            posts: { processed: 2, updated: 1 }
        });

        // Verify updates were executed
        expect(env.writes).toContainEqual({
            op: "update",
            path: "",
            value: expect.objectContaining({
                "users/user-dirty/photo_path": null,
                "users/user-dirty/settings/push_notifications": null,
                "users/user-dirty/settings/dark_mode": null,
                "users/user-dirty/settings/isDarkMode": null,
                "posts/post-dirty/photo_path": null
            })
        });
    });
});
