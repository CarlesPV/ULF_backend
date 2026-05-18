const { setupCallableTestEnv } = require("./helpers/callableTestEnv");

function messageDeletedEvent(message, chatId = "chat-1", messageId = "message-1") {
    return {
        params: { chatId, messageId },
        data: {
            val: jest.fn(() => message)
        }
    };
}

describe("onMessageDeleted trigger", () => {
    let env;
    let bucketMock;
    let fileMock;

    beforeEach(() => {
        jest.resetModules();
        env = setupCallableTestEnv();
        
        fileMock = {
            delete: jest.fn().mockResolvedValue([]),
        };
        // Mock Storage
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

    test("does nothing for non-image messages", async () => {
        const { onMessageDeleted } = require("../../lib/chats/onMessageDeleted");

        await onMessageDeleted(messageDeletedEvent({
            type: "text",
            text: "Hola",
            sender_id: "user-1",
            timestamp: 123
        }));

        expect(bucketMock.file).not.toHaveBeenCalled();
    });

    test("deletes associated Storage file for image messages", async () => {
        const { onMessageDeleted } = require("../../lib/chats/onMessageDeleted");

        await onMessageDeleted(messageDeletedEvent({
            type: "image",
            imageUrl: "https://firebasestorage.googleapis.com/v0/b/test-bucket/o/chats%2Fchat-1%2Fmessage-1.jpg?alt=media",
            sender_id: "user-1",
            timestamp: 123
        }));

        expect(bucketMock.file).toHaveBeenCalledWith("chats/chat-1/message-1.jpg");
        expect(fileMock.delete).toHaveBeenCalled();
    });

    test("ignores deletion failures gracefully", async () => {
        const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        
        // Mock delete to reject
        fileMock.delete = jest.fn().mockRejectedValue(new Error("Storage delete failed"));

        const { onMessageDeleted } = require("../../lib/chats/onMessageDeleted");

        await onMessageDeleted(messageDeletedEvent({
            type: "image",
            imageUrl: "https://firebasestorage.googleapis.com/v0/b/test-bucket/o/chats%2Fchat-1%2Fmessage-1.jpg?alt=media",
            sender_id: "user-1",
            timestamp: 123
        }));

        expect(bucketMock.file).toHaveBeenCalledWith("chats/chat-1/message-1.jpg");
        expect(errorSpy).toHaveBeenCalled();
    });
});
