const { setupCallableTestEnv } = require("./helpers/callableTestEnv");

describe("onUserProfileUpdated trigger", () => {
    let env;

    beforeEach(() => {
        env = setupCallableTestEnv({
            onceByPath: {
                "user_chats/user_123": {
                    "chat_abc": 1700000000000,
                    "chat_def": 1700000000000
                }
            }
        });
    });

    test("should sync name and photo in user's chats when profile changes", async () => {
        const { onUserProfileUpdated } = require("../../lib/users/onUserProfileUpdated");
        
        const event = {
            params: { userId: "user_123" },
            data: {
                before: { val: () => ({ name: "Old Name", photoUrl: "http://old.jpg" }) },
                after: { val: () => ({ name: "New Name", photoUrl: "http://new.jpg" }) }
            }
        };

        await onUserProfileUpdated(event);

        // Verify atomic update in both chats
        expect(env.writes).toContainEqual({
            op: "update",
            path: "",
            value: expect.objectContaining({
                "chats/chat_abc/usersInfo/user_123/displayName": "New Name",
                "chats/chat_abc/usersInfo/user_123/photoUrl": "http://new.jpg",
                "chats/chat_def/usersInfo/user_123/displayName": "New Name",
                "chats/chat_def/usersInfo/user_123/photoUrl": "http://new.jpg"
            })
        });
    });

    test("should not sync if name and photo didn't change", async () => {
        const { onUserProfileUpdated } = require("../../lib/users/onUserProfileUpdated");
        
        const event = {
            params: { userId: "user_123" },
            data: {
                before: { val: () => ({ name: "Same", photoUrl: "http://same.jpg", email: "old@uab.cat" }) },
                after: { val: () => ({ name: "Same", photoUrl: "http://same.jpg", email: "new@uab.cat" }) }
            }
        };

        await onUserProfileUpdated(event);
        expect(env.writes.length).toBe(0);
    });

    test("should not sync when the user profile is deleted", async () => {
        const { onUserProfileUpdated } = require("../../lib/users/onUserProfileUpdated");

        await onUserProfileUpdated({
            params: { userId: "user_123" },
            data: {
                before: { val: () => ({ name: "Old Name", photoUrl: "http://old.jpg" }) },
                after: { val: () => null }
            }
        });

        expect(env.writes).toEqual([]);
    });

    test("should not sync profile changes when the user has no chats", async () => {
        env = setupCallableTestEnv({
            onceByPath: {
                "user_chats/user_123": null
            }
        });
        const { onUserProfileUpdated } = require("../../lib/users/onUserProfileUpdated");

        await onUserProfileUpdated({
            params: { userId: "user_123" },
            data: {
                before: { val: () => ({ name: "Old Name", photoUrl: "http://old.jpg" }) },
                after: { val: () => ({ name: "New Name", photoUrl: "http://new.jpg" }) }
            }
        });

        expect(env.writes).toEqual([]);
    });

    test("should sync only the changed name", async () => {
        const { onUserProfileUpdated } = require("../../lib/users/onUserProfileUpdated");

        await onUserProfileUpdated({
            params: { userId: "user_123" },
            data: {
                before: { val: () => ({ name: "Old Name", photoUrl: "http://same.jpg" }) },
                after: { val: () => ({ name: "New Name", photoUrl: "http://same.jpg" }) }
            }
        });

        expect(env.writes[0]).toEqual({
            op: "update",
            path: "",
            value: {
                "chats/chat_abc/usersInfo/user_123/displayName": "New Name",
                "chats/chat_def/usersInfo/user_123/displayName": "New Name"
            }
        });
    });

    test("should sync only the changed photo", async () => {
        const { onUserProfileUpdated } = require("../../lib/users/onUserProfileUpdated");

        await onUserProfileUpdated({
            params: { userId: "user_123" },
            data: {
                before: { val: () => ({ name: "Same Name", photoUrl: "http://old.jpg" }) },
                after: { val: () => ({ name: "Same Name", photoUrl: "http://new.jpg" }) }
            }
        });

        expect(env.writes[0]).toEqual({
            op: "update",
            path: "",
            value: {
                "chats/chat_abc/usersInfo/user_123/photoUrl": "http://new.jpg",
                "chats/chat_def/usersInfo/user_123/photoUrl": "http://new.jpg"
            }
        });
    });
});
