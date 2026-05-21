const { setupCallableTestEnv } = require("./helpers/callableTestEnv");

function messageEvent(message, chatId = "chat-1", messageId = "message-1") {
    return {
        params: { chatId, messageId },
        data: {
            val: jest.fn(() => message)
        }
    };
}

describe("onMessageCreated trigger", () => {
    test("does nothing for invalid messages", async () => {
        const env = setupCallableTestEnv();
        const { onMessageCreated } = require("../../lib/chats/onMessageCreated");

        await onMessageCreated(messageEvent({ sender_id: "user-1", timestamp: 123 }));

        expect(env.writes).toEqual([]);
        expect(env.messagingApi.send).not.toHaveBeenCalled();
    });

    test("updates chat metadata and user chat indexes for valid messages", async () => {
        const env = setupCallableTestEnv({
            onceByPath: {
                "chats/chat-1/members": {
                    "sender-1": true,
                    "receiver-1": true
                },
                "users/receiver-1": {
                    settings: {
                        pushNotificationsEnabled: false,
                        language: "es"
                    }
                },
                "users/receiver-1/settings/pushNotificationsEnabled": false,
                "users/receiver-1/fcm_tokens": {
                    "receiver-token": true
                }
            }
        });
        const { onMessageCreated } = require("../../lib/chats/onMessageCreated");

        await onMessageCreated(messageEvent({
            text: "Hola, siguen disponibles las llaves?",
            timestamp: 12345,
            sender_id: "sender-1"
        }));

        expect(env.writes[0]).toEqual({
            op: "update",
            path: "",
            value: {
                "chats/chat-1/last_message": "Hola, siguen disponibles las llaves?",
                "chats/chat-1/last_message_time": 12345,
                "user_chats/sender-1/chat-1": 12345,
                "user_chats/receiver-1/chat-1": 12345
            }
        });
        expect(env.writes).toContainEqual(expect.objectContaining({
            op: "set",
            path: "users/receiver-1/notifications/mock-key-1",
            value: expect.objectContaining({
                read: false,
                title: "Nuevo mensaje",
                body: "Hola, siguen disponibles las llaves?"
            })
        }));
        expect(env.messagingApi.send).not.toHaveBeenCalled();
    });

    test("truncates long messages in chat metadata", async () => {
        const env = setupCallableTestEnv({
            onceByPath: {
                "chats/chat-1/members": {
                    "sender-1": true
                }
            }
        });
        const { onMessageCreated } = require("../../lib/chats/onMessageCreated");

        await onMessageCreated(messageEvent({
            text: "12345678901234567890123456789012345678901",
            timestamp: 99,
            sender_id: "sender-1"
        }));

        expect(env.writes[0].value["chats/chat-1/last_message"]).toBe("1234567890123456789012345678901234567890...");
    });

    test("sends localized push notifications to members except the sender", async () => {
        const env = setupCallableTestEnv({
            onceByPath: {
                "chats/chat-1/members": {
                    "sender-1": true,
                    "receiver-1": true
                },
                "users/receiver-1": {
                    settings: {
                        push_notifications: true,
                        language: "ca"
                    }
                },
                "users/receiver-1/fcm_tokens": {
                    "receiver-token": true
                }
            }
        });
        const { onMessageCreated } = require("../../lib/chats/onMessageCreated");

        await onMessageCreated(messageEvent({
            text: "Missatge nou",
            timestamp: 12345,
            sender_id: "sender-1"
        }, "chat-1", "message-99"));

        expect(env.messagingApi.send).toHaveBeenCalledTimes(1);
        expect(env.messagingApi.send).toHaveBeenCalledWith(expect.objectContaining({
            token: "receiver-token",
            notification: {
                title: "Nou missatge",
                body: "Missatge nou"
            },
            data: expect.objectContaining({
                type: "chat",
                chatId: "chat-1",
                messageId: "message-99"
            })
        }));
    });

    test("removes invalid notification tokens without interrupting the trigger", async () => {
        jest.spyOn(console, "error").mockImplementation(() => {});
        const invalidTokenError = new Error("invalid token");
        invalidTokenError.code = "messaging/invalid-registration-token";
        const env = setupCallableTestEnv({
            onceByPath: {
                "chats/chat-1/members": {
                    "sender-1": true,
                    "receiver-1": true
                },
                "users/receiver-1": {
                    settings: {
                        push_notifications: true,
                        language: "es"
                    }
                },
                "users/receiver-1/fcm_tokens": {
                    "bad-token": true
                }
            },
            sendRejectsByToken: {
                "bad-token": invalidTokenError
            }
        });
        const { onMessageCreated } = require("../../lib/chats/onMessageCreated");

        await onMessageCreated(messageEvent({
            text: "Hola",
            timestamp: 12345,
            sender_id: "sender-1"
        }));

        expect(env.writes).toContainEqual({
            op: "remove",
            path: "users/receiver-1/fcm_tokens/bad-token"
        });
        expect(env.writes[0]).toEqual(expect.objectContaining({
            op: "update",
            path: ""
        }));
    });

    test("keeps chat update successful when a member notification lookup fails", async () => {
        jest.spyOn(console, "error").mockImplementation(() => {});
        const env = setupCallableTestEnv({
            onceByPath: {
                "chats/chat-1/members": {
                    "sender-1": true,
                    "receiver-1": true
                }
            },
            onceRejectsByPath: {
                "users/receiver-1": new Error("user read failed")
            }
        });
        const { onMessageCreated } = require("../../lib/chats/onMessageCreated");

        await onMessageCreated(messageEvent({
            text: "Hola",
            timestamp: 12345,
            sender_id: "sender-1"
        }));

        expect(env.writes[0]).toEqual(expect.objectContaining({
            op: "update",
            path: ""
        }));
        expect(env.messagingApi.send).not.toHaveBeenCalled();
    });

    test("sends image localized push notifications to members", async () => {
        const env = setupCallableTestEnv({
            onceByPath: {
                "chats/chat-1/members": {
                    "sender-1": true,
                    "receiver-1": true
                },
                "users/receiver-1": {
                    settings: {
                        push_notifications: true,
                        language: "ca"
                    }
                },
                "users/receiver-1/fcm_tokens": {
                    "receiver-token": true
                }
            }
        });
        const { onMessageCreated } = require("../../lib/chats/onMessageCreated");

        await onMessageCreated(messageEvent({
            messageType: "image",
            imageUrl: "https://example.com/image.jpg",
            timestamp: 12345,
            sender_id: "sender-1"
        }, "chat-1", "message-99"));

        expect(env.messagingApi.send).toHaveBeenCalledTimes(1);
        expect(env.messagingApi.send).toHaveBeenCalledWith(expect.objectContaining({
            token: "receiver-token",
            notification: {
                title: "Nou missatge",
                body: "📷 Imatge"
            },
            data: expect.objectContaining({
                type: "chat",
                chatId: "chat-1",
                messageId: "message-99"
            })
        }));
    });

    test("sends push notification with top-level preferredLanguage if settings language is missing", async () => {
        const env = setupCallableTestEnv({
            onceByPath: {
                "chats/chat-1/members": {
                    "sender-1": true,
                    "receiver-1": true
                },
                "users/receiver-1": {
                    preferredLanguage: "ca",
                    settings: {
                        push_notifications: true
                    }
                },
                "users/receiver-1/fcm_tokens": {
                    "receiver-token": true
                }
            }
        });
        const { onMessageCreated } = require("../../lib/chats/onMessageCreated");

        await onMessageCreated(messageEvent({
            text: "Hola",
            timestamp: 12345,
            sender_id: "sender-1"
        }, "chat-1", "message-99"));

        expect(env.messagingApi.send).toHaveBeenCalledTimes(1);
        expect(env.messagingApi.send).toHaveBeenCalledWith(expect.objectContaining({
            token: "receiver-token",
            notification: {
                title: "Nou missatge",
                body: "Hola"
            },
            data: expect.objectContaining({
                type: "chat",
                chatId: "chat-1",
                messageId: "message-99"
            })
        }));
    });

    test("does not send push or in-app notifications if receiver is in the active chat", async () => {
        const env = setupCallableTestEnv({
            onceByPath: {
                "chats/chat-1/members": {
                    "sender-1": true,
                    "receiver-1": true
                },
                "users/receiver-1/status/currentChat": "chat-1",
                "users/receiver-1": {
                    settings: {
                        push_notifications: true,
                        language: "es"
                    }
                },
                "users/receiver-1/fcm_tokens": {
                    "receiver-token": true
                }
            }
        });
        const { onMessageCreated } = require("../../lib/chats/onMessageCreated");

        await onMessageCreated(messageEvent({
            text: "Hola, estás ahí?",
            timestamp: 12345,
            sender_id: "sender-1"
        }, "chat-1", "message-100"));

        // Verificar que NO se enviaron notificaciones push
        expect(env.messagingApi.send).not.toHaveBeenCalled();

        // Verificar que NO se crearon registros de notificación in-app (la única escritura debe ser la actualización del chat metadata en /)
        const inAppNotifications = env.writes.filter(w => w.op === "set" && w.path.startsWith("users/receiver-1/notifications"));
        expect(inAppNotifications.length).toBe(0);

        // Debería actualizar los metadatos del chat y de user_chats normalmente
        expect(env.writes[0]).toEqual({
            op: "update",
            path: "",
            value: {
                "chats/chat-1/last_message": "Hola, estás ahí?",
                "chats/chat-1/last_message_time": 12345,
                "user_chats/sender-1/chat-1": 12345,
                "user_chats/receiver-1/chat-1": 12345
            }
        });
    });

    test("sends notifications if receiver is in a different chat", async () => {
        const env = setupCallableTestEnv({
            onceByPath: {
                "chats/chat-1/members": {
                    "sender-1": true,
                    "receiver-1": true
                },
                "users/receiver-1/status/currentChat": "chat-different",
                "users/receiver-1": {
                    settings: {
                        push_notifications: true,
                        language: "es"
                    }
                },
                "users/receiver-1/fcm_tokens": {
                    "receiver-token": true
                }
            }
        });
        const { onMessageCreated } = require("../../lib/chats/onMessageCreated");

        await onMessageCreated(messageEvent({
            text: "Hola, estás ahí?",
            timestamp: 12345,
            sender_id: "sender-1"
        }, "chat-1", "message-100"));

        // Debería enviar push
        expect(env.messagingApi.send).toHaveBeenCalledTimes(1);

        // Debería guardar in-app
        const inAppNotifications = env.writes.filter(w => w.op === "set" && w.path.startsWith("users/receiver-1/notifications"));
        expect(inAppNotifications.length).toBe(1);
    });

    test("sends notifications defensively if reading presence status fails", async () => {
        jest.spyOn(console, "error").mockImplementation(() => {});
        const env = setupCallableTestEnv({
            onceByPath: {
                "chats/chat-1/members": {
                    "sender-1": true,
                    "receiver-1": true
                },
                "users/receiver-1": {
                    settings: {
                        push_notifications: true,
                        language: "es"
                    }
                },
                "users/receiver-1/fcm_tokens": {
                    "receiver-token": true
                }
            },
            onceRejectsByPath: {
                "users/receiver-1/status/currentChat": new Error("Database timeout")
            }
        });
        const { onMessageCreated } = require("../../lib/chats/onMessageCreated");

        await onMessageCreated(messageEvent({
            text: "Hola, estás ahí?",
            timestamp: 12345,
            sender_id: "sender-1"
        }, "chat-1", "message-100"));

        // Al fallar la lectura, se asume que no está en el chat y se envían notificaciones
        expect(env.messagingApi.send).toHaveBeenCalledTimes(1);

        const inAppNotifications = env.writes.filter(w => w.op === "set" && w.path.startsWith("users/receiver-1/notifications"));
        expect(inAppNotifications.length).toBe(1);
    });
});

