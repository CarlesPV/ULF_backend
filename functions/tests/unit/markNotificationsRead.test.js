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
        "users/user-1/notifications": {
          "notif-123": {
            id: "notif-123",
            read: false,
            title: "Test",
            body: "Body"
          }
        }
      }
    });

    const { markNotificationsRead } = require("../../lib/notifications/markNotificationsRead");

    const result = await markNotificationsRead(authenticatedRequest({ notificationId: "notif-123" }));

    expect(result).toEqual({ success: true });

    expect(env.writes).toContainEqual({
      op: "update",
      path: "",
      value: { "users/user-1/notifications/notif-123/read": true }
    });
  });

  test("throws not-found when the specified notificationId does not exist", async () => {
    setupCallableTestEnv({
      onceByPath: {
        "users/user-1/notifications": null
      }
    });

    const { markNotificationsRead } = require("../../lib/notifications/markNotificationsRead");

    await expect(markNotificationsRead(authenticatedRequest({ notificationId: "notif-123" })))
      .rejects.toMatchObject({ code: "not-found" });
  });

  test("marks multiple notifications as read if notificationIds is provided (omitting already read ones)", async () => {
    const env = setupCallableTestEnv({
      onceByPath: {
        "users/user-1/notifications": {
          "notif-A": { id: "notif-A", read: false },
          "notif-B": { id: "notif-B", read: false },
          "notif-C": { id: "notif-C", read: true }
        }
      }
    });

    const { markNotificationsRead } = require("../../lib/notifications/markNotificationsRead");

    const result = await markNotificationsRead(authenticatedRequest({
      notificationIds: ["notif-A", "notif-B", "notif-C"]
    }));

    expect(result).toEqual({ success: true });

    expect(env.writes).toContainEqual({
      op: "update",
      path: "",
      value: {
        "users/user-1/notifications/notif-A/read": true,
        "users/user-1/notifications/notif-B/read": true
      }
    });
  });

  test("marks all notifications as read if all: true is provided (omitting already read ones)", async () => {
    const env = setupCallableTestEnv({
      onceByPath: {
        "users/user-1/notifications": {
          "notif-X": { id: "notif-X", read: false },
          "notif-Y": { id: "notif-Y", read: false },
          "notif-Z": { id: "notif-Z", read: true }
        }
      }
    });

    const { markNotificationsRead } = require("../../lib/notifications/markNotificationsRead");

    const result = await markNotificationsRead(authenticatedRequest({ all: true }));

    expect(result).toEqual({ success: true });

    expect(env.writes).toContainEqual({
      op: "update",
      path: "",
      value: {
        "users/user-1/notifications/notif-X/read": true,
        "users/user-1/notifications/notif-Y/read": true
      }
    });
  });

  test("rejects invalid or path traversal notificationId formats for Zero Trust security", async () => {
    setupCallableTestEnv();
    const { markNotificationsRead } = require("../../lib/notifications/markNotificationsRead");

    await expect(markNotificationsRead(authenticatedRequest({ notificationId: "../malicious" })))
      .rejects.toMatchObject({ code: "invalid-argument" });

    await expect(markNotificationsRead(authenticatedRequest({ notificationIds: ["notif-1", "bad/path"] })))
      .rejects.toMatchObject({ code: "invalid-argument" });
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

    expect(result).toEqual({ success: true });

    expect(env.writes).toContainEqual({
      op: "update",
      path: "",
      value: {
        "users/user-1/notifications/notif-1/read": true,
        "users/user-1/notifications/notif-2/read": true
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

    expect(result).toEqual({ success: true });
    expect(env.writes.filter(w => w.path === "users/user-1/notifications")).toHaveLength(0);
  });
});
