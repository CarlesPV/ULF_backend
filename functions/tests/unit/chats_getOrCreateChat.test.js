const { setupCallableTestEnv } = require("./helpers/callableTestEnv");

describe("getOrCreateChat callable", () => {
    let env;

    beforeEach(() => {
        env = setupCallableTestEnv({
            onceByPath: {
                "posts/post-1": {
                    title: "Llaves perdidas",
                    imageUrl: "https://storage.com/post-1.jpg",
                    center_id: "uab"
                }
            }
        });
    });

    test("rejects unauthenticated users", async () => {
        const getOrCreateChat = require("../../lib/chats/getOrCreateChat").getOrCreateChat;

        await expect(getOrCreateChat({
            data: {
                postId: "post-1",
                postOwnerId: "user-owner",
                centerId: "uab"
            }
        })).rejects.toMatchObject({ code: "unauthenticated" });
    });

    test("creates a new chat with post metadata", async () => {
        const getOrCreateChat = require("../../lib/chats/getOrCreateChat").getOrCreateChat;
        
        const data = {
            postId: "post-1",
            postOwnerId: "user-owner",
            centerId: "uab",
            postTitle: "Título sugerido"
        };
        const request = {
            data,
            auth: { uid: "user-buyer", token: { email_verified: true } }
        };

        const result = await getOrCreateChat(request);

        expect(result).toEqual({ chatId: "mock-key-1" });
        
        // Verificar que se guardó el chat con la imagen y título del POST desnormalizado
        const chatWrite = env.writes.find(w => w.path.startsWith("chats/"));
        expect(chatWrite.value).toEqual(expect.objectContaining({
            id: "mock-key-1",
            postTitle: "Llaves perdidas",
            postImageUrl: "https://storage.com/post-1.jpg",
            post_id: "post-1",
            post_owner_id: "user-owner",
            usersInfo: expect.objectContaining({
                "user-buyer": expect.any(Object),
                "user-owner": expect.any(Object)
            }),
            last_message: "SYSTEM_MSG_CHAT_STARTED"
        }));
        expect(env.writes).toContainEqual({
            op: "set",
            path: "user_chats/user-buyer/mock-key-1",
            value: 1700000000000
        });
        expect(env.writes).toContainEqual({
            op: "set",
            path: "user_chats/user-owner/mock-key-1",
            value: 1700000000000
        });
    });

    test("returns existing chat if it already exists for the same post and user", async () => {
        const existingChatId = "chat-abc";
        env = setupCallableTestEnv({
            onceByQuery: {
                "chats|orderByChild:post_id|equalTo:post-1": {
                    [existingChatId]: {
                        id: existingChatId,
                        post_id: "post-1",
                        members: { "user-buyer": true, "user-owner": true }
                    }
                }
            }
        });

        const getOrCreateChat = require("../../lib/chats/getOrCreateChat").getOrCreateChat;
        const data = { postId: "post-1", postOwnerId: "user-owner", centerId: "uab" };
        const request = {
            data,
            auth: { uid: "user-buyer", token: { email_verified: true } }
        };

        const result = await getOrCreateChat(request);
        expect(result.chatId).toBe(existingChatId);
        expect(env.writes).toEqual([]);
    });

    test("creates a new chat using fallback post and user metadata", async () => {
        env = setupCallableTestEnv();
        const getOrCreateChat = require("../../lib/chats/getOrCreateChat").getOrCreateChat;

        const result = await getOrCreateChat({
            data: {
                postId: "post-missing",
                postOwnerId: "user-owner",
                centerId: "uab",
                postTitle: "Título sugerido"
            },
            auth: { uid: "user-buyer", token: { email_verified: true } }
        });

        expect(result).toEqual({ chatId: "mock-key-1" });
        expect(env.writes[0]).toEqual({
            op: "set",
            path: "chats/mock-key-1",
            value: expect.objectContaining({
                postTitle: "Título sugerido",
                postImageUrl: null,
                usersInfo: {
                    "user-buyer": {
                        displayName: "Usuario",
                        photoUrl: null
                    },
                    "user-owner": {
                        displayName: "Usuario",
                        photoUrl: null
                    }
                }
            })
        });
    });
});
