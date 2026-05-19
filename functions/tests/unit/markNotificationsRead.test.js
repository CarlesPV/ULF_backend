const { setupCallableTestEnv, snapshot } = require("./helpers/callableTestEnv");

function authenticatedRequest(data = {}) {
  return {
    auth: {
      uid: "user-1",
      token: { email_verified: true }
    },
    data
  };
}

describe("markNotificationsRead", () => {
  test("rejects unauthenticated requests", async () => {
    setupCallableTestEnv();
    const { markNotificationsRead } = require("../../lib/notifications/markNotificationsRead");

    await expect(markNotificationsRead({ data: {} }))
      .rejects.toMatchObject({ code: "unauthenticated" });
  });

  test("marks a single notification as read if notificationId is provided", async () => {
    const env = setupCallableTestEnv({
      onceByPath: {
        "users/user-1/notifications/notif-123": {
          id: "notif-123",
          read: false,
          title: "Test",
          body: "Body"
        }
      }
    });

    const { markNotificationsRead } = require("../../lib/notifications/markNotificationsRead");

    const result = await markNotificationsRead(authenticatedRequest({ notificationId: "notif-123" }));

    expect(result).toEqual({
      success: true,
      message: "Notificación marcada como leída."
    });

    expect(env.writes).toContainEqual({
      op: "update",
      path: "users/user-1/notifications/notif-123",
      value: { read: true }
    });
  });

  test("throws not-found when the specified notificationId does not exist", async () => {
    setupCallableTestEnv({
      onceByPath: {
        "users/user-1/notifications/notif-123": null
      }
    });

    const { markNotificationsRead } = require("../../lib/notifications/markNotificationsRead");

    await expect(markNotificationsRead(authenticatedRequest({ notificationId: "notif-123" })))
      .rejects.toMatchObject({ code: "not-found" });
  });

  test("marks all notifications as read if notificationId is not provided", async () => {
    const env = setupCallableTestEnv({
      onceByPath: {
        "users/user-1/notifications": {
          "notif-1": { id: "notif-1", read: false },
          "notif-2": { id: "notif-2", read: false }
        }
      }
    });

    const { markNotificationsRead } = require("../../lib/notifications/markNotificationsRead");

    const result = await markNotificationsRead(authenticatedRequest({}));

    expect(result).toEqual({
      success: true,
      message: "Todas las notificaciones marcadas como leídas."
    });

    expect(env.writes).toContainEqual({
      op: "update",
      path: "users/user-1/notifications",
      value: {
        "notif-1/read": true,
        "notif-2/read": true
      }
    });
  });

  test("completes successfully and does nothing if user has no notifications", async () => {
    const env = setupCallableTestEnv({
      onceByPath: {
        "users/user-1/notifications": null
      }
    });

    const { markNotificationsRead } = require("../../lib/notifications/markNotificationsRead");

    const result = await markNotificationsRead(authenticatedRequest({}));

    expect(result).toEqual({
      success: true,
      message: "Todas las notificaciones marcadas como leídas."
    });
    expect(env.writes.filter(w => w.path === "users/user-1/notifications")).toHaveLength(0);
  });
});
