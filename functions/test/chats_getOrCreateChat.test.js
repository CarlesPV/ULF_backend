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

    test("creates a new chat with post metadata", async () => {
        const getOrCreateChat = require("../lib/chats/getOrCreateChat").getOrCreateChat;
        
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

        expect(result.chatId).toBeDefined();
        
        // Verificar que se guardó el chat con la imagen y título del POST desnormalizado
        const chatWrite = env.writes.find(w => w.path.startsWith("chats/"));
        expect(chatWrite.value).toEqual(expect.objectContaining({
            postTitle: "Llaves perdidas",
            postImageUrl: "https://storage.com/post-1.jpg",
            post_id: "post-1",
            usersInfo: expect.objectContaining({
                "user-buyer": expect.any(Object),
                "user-owner": expect.any(Object)
            }),
            last_message: "SYSTEM_MSG_CHAT_STARTED"
        }));
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

        const getOrCreateChat = require("../lib/chats/getOrCreateChat").getOrCreateChat;
        const data = { postId: "post-1", postOwnerId: "user-owner", centerId: "uab" };
        const request = {
            data,
            auth: { uid: "user-buyer", token: { email_verified: true } }
        };

        const result = await getOrCreateChat(request);
        expect(result.chatId).toBe(existingChatId);
    });
});
