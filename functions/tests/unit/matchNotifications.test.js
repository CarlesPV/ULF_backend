const { setupCallableTestEnv } = require("./helpers/callableTestEnv");

function matchPayload(overrides = {}) {
    return {
        type: "match_found",
        title: "Match found!",
        body: "An item was found that might match your search.",
        data: {
            matchPostId: "post-1",
            matchTitle: "Llaves azules",
            matchScore: 2,
            matchPhotoUrl: "https://example.com/post.jpg",
            timestamp: 1710000000000,
            ...overrides
        }
    };
}

describe("Match Notification System", () => {
    test("sendNotificationToUser returns false when the user has no FCM tokens", async () => {
        const env = setupCallableTestEnv({
            onceByPath: {
                "users/user-no-tokens/fcm_tokens": null
            }
        });
        const { sendNotificationToUser } = require("../../lib/shared/notifications");

        const result = await sendNotificationToUser("user-no-tokens", matchPayload());

        expect(result).toBe(false);
        expect(env.messagingApi.send).not.toHaveBeenCalled();
    });

    test("sendNotificationToUser sends the payload to all registered FCM tokens", async () => {
        const env = setupCallableTestEnv({
            onceByPath: {
                "users/user-1/fcm_tokens": {
                    "token-1": true,
                    "token-2": true
                }
            }
        });
        const { sendNotificationToUser } = require("../../lib/shared/notifications");

        const result = await sendNotificationToUser("user-1", matchPayload());

        expect(result).toBe(true);
        expect(env.messagingApi.send).toHaveBeenCalledTimes(2);
        expect(env.messagingApi.send).toHaveBeenCalledWith(expect.objectContaining({
            token: "token-1",
            notification: {
                title: "Match found!",
                body: "An item was found that might match your search."
            },
            data: expect.objectContaining({
                type: "match_found",
                matchPostId: "post-1",
                matchScore: "2"
            })
        }));
    });

    test("sendNotificationToUser skips FCM when push notifications are disabled", async () => {
        const env = setupCallableTestEnv({
            onceByPath: {
                "users/user-1/settings/pushNotificationsEnabled": false,
                "users/user-1/fcm_tokens": {
                    "token-1": true
                }
            }
        });
        const { sendNotificationToUser } = require("../../lib/shared/notifications");

        const result = await sendNotificationToUser("user-1", matchPayload());

        expect(result).toBe(false);
        expect(env.messagingApi.send).not.toHaveBeenCalled();
    });

    test("sendNotificationToUser removes invalid FCM tokens and still succeeds for valid tokens", async () => {
        jest.spyOn(console, "error").mockImplementation(() => {});
        const invalidTokenError = new Error("invalid token");
        invalidTokenError.code = "messaging/invalid-registration-token";
        const env = setupCallableTestEnv({
            onceByPath: {
                "users/user-1/fcm_tokens": {
                    "bad-token": true,
                    "good-token": true
                }
            },
            sendRejectsByToken: {
                "bad-token": invalidTokenError
            }
        });
        const { sendNotificationToUser } = require("../../lib/shared/notifications");

        const result = await sendNotificationToUser("user-1", matchPayload());

        expect(result).toBe(true);
        expect(env.writes).toContainEqual({
            op: "remove",
            path: "users/user-1/fcm_tokens/bad-token"
        });
    });

    test("notifyMatchFound uses the user's language and match data in the outgoing payload", async () => {
        jest.spyOn(Date, "now").mockReturnValue(1710000000000);
        const env = setupCallableTestEnv({
            onceByPath: {
                "users/user-1": {
                    settings: {
                        language: "ca"
                    }
                },
                "users/user-1/fcm_tokens": {
                    "token-ca": true
                }
            }
        });
        const { notifyMatchFound } = require("../../lib/shared/notifications");

        const result = await notifyMatchFound("user-1", {
            id: "post-99",
            title: "Motxilla blava",
            description: "A prop de la biblioteca",
            photo_url: "https://example.com/photo.jpg"
        }, 2.5);

        expect(result).toBe(true);
        expect(env.messagingApi.send).toHaveBeenCalledWith(expect.objectContaining({
            token: "token-ca",
            notification: {
                title: "Possible coincidència!",
                body: "Hem trobat un objecte que coincideix en un 80% o més amb la teva publicació."
            },
            data: expect.objectContaining({
                type: "match_found",
                postId: "post-99",
                matchPostId: "post-99",
                matchTitle: "Motxilla blava",
                matchScore: "2.5",
                matchPhotoUrl: "https://example.com/photo.jpg",
                score: "2.5",
                photo_url: "https://example.com/photo.jpg",
                timestamp: "1710000000000"
            })
        }));
    });

    test("notifyMultipleUsersOfMatch returns success and failure counts", async () => {
        const env = setupCallableTestEnv({
            onceByPath: {
                "users/user-ok": {
                    settings: {
                        language: "es"
                    }
                },
                "users/user-ok/fcm_tokens": {
                    "token-ok": true
                },
                "users/user-fail": {
                    settings: {
                        language: "es"
                    }
                },
                "users/user-fail/fcm_tokens": null
            }
        });
        const { notifyMultipleUsersOfMatch } = require("../../lib/shared/notifications");

        const result = await notifyMultipleUsersOfMatch(["user-ok", "user-fail"], {
            id: "post-1",
            title: "Llaves",
            description: "Azules"
        }, 1.5);

        expect(result).toEqual({ success: 1, failed: 1 });
        expect(env.messagingApi.send).toHaveBeenCalledTimes(1);
    });

    test("notifyMatchFound falls back gracefully to 'es' on unsupported language or database retrieval error", async () => {
        jest.spyOn(console, "error").mockImplementation(() => {});
        const env = setupCallableTestEnv({
            onceByPath: {
                "users/user-fallback": {
                    settings: {
                        language: "invalid-lang" // unsupported language
                    }
                },
                "users/user-fallback/fcm_tokens": {
                    "token-fallback": true
                }
            }
        });
        const { notifyMatchFound } = require("../../lib/shared/notifications");

        const result = await notifyMatchFound("user-fallback", {
            id: "post-88",
            title: "Item",
            description: "Desc"
        }, 3.0);

        expect(result).toBe(true);
        expect(env.messagingApi.send).toHaveBeenCalledWith(expect.objectContaining({
            token: "token-fallback",
            notification: {
                title: "¡Posible coincidencia!", // Spanish fallback title
                body: "Hemos encontrado un objeto que coincide en un 80% o más con tu publicación."
            }
        }));
    });

    test("notifyMatchFound uses top-level preferredLanguage if settings language is missing", async () => {
        jest.spyOn(Date, "now").mockReturnValue(1710000000000);
        const env = setupCallableTestEnv({
            onceByPath: {
                "users/user-top-lang": {
                    preferredLanguage: "ca"
                },
                "users/user-top-lang/fcm_tokens": {
                    "token-top-lang": true
                }
            }
        });
        const { notifyMatchFound } = require("../../lib/shared/notifications");

        const result = await notifyMatchFound("user-top-lang", {
            id: "post-99",
            title: "Motxilla blava",
            description: "A prop de la biblioteca",
            photo_url: "https://example.com/photo.jpg"
        }, 2.5);

        expect(result).toBe(true);
        expect(env.messagingApi.send).toHaveBeenCalledWith(expect.objectContaining({
            token: "token-top-lang",
            notification: {
                title: "Possible coincidència!",
                body: "Hem trobat un objecte que coincideix en un 80% o més amb la teva publicació."
            },
            data: expect.objectContaining({
                type: "match_found",
                postId: "post-99",
                matchPostId: "post-99",
                matchTitle: "Motxilla blava",
                matchScore: "2.5",
                matchPhotoUrl: "https://example.com/photo.jpg",
                score: "2.5",
                photo_url: "https://example.com/photo.jpg",
                timestamp: "1710000000000"
            })
        }));
    });
});
