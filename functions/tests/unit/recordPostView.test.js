const { setupCallableTestEnv } = require("./helpers/callableTestEnv");

function verifiedRequest(data = {}) {
  return {
    auth: {
      uid: "user-1",
      token: { email_verified: true }
    },
    data
  };
}

describe("recordPostView", () => {
  test("stores a timestamped view for the authenticated user", async () => {
    const env = setupCallableTestEnv({
      onceByPath: {
        "posts/post-1": { user_id: "owner-1" }
      }
    });
    const { recordPostView } = require("../../lib/posts/recordPostView");

    const result = await recordPostView(verifiedRequest({ postId: "post-1" }));

    expect(result).toEqual({ success: true });
    expect(env.writes).toEqual([
      {
        op: "set",
        path: "post_views/post-1/user-1",
        value: { timestamp: 1700000000000 }
      }
    ]);
  });

  test("rejects users without a verified email", async () => {
    setupCallableTestEnv();
    const { recordPostView } = require("../../lib/posts/recordPostView");

    await expect(recordPostView({
      auth: {
        uid: "user-1",
        token: { email_verified: false }
      },
      data: { postId: "post-1" }
    })).rejects.toMatchObject({ code: "unauthenticated" });
  });

  test("rejects invalid post ids", async () => {
    setupCallableTestEnv();
    const { recordPostView } = require("../../lib/posts/recordPostView");

    await expect(recordPostView(verifiedRequest({ postId: "   " })))
      .rejects
      .toMatchObject({ code: "invalid-argument" });
  });

  test("rejects missing posts", async () => {
    setupCallableTestEnv();
    const { recordPostView } = require("../../lib/posts/recordPostView");

    await expect(recordPostView(verifiedRequest({ postId: "post-missing" })))
      .rejects
      .toMatchObject({ code: "not-found" });
  });

  test("does not store a view when the viewer owns the post", async () => {
    const env = setupCallableTestEnv({
      onceByPath: {
        "posts/post-1": { user_id: "user-1" }
      }
    });
    const { recordPostView } = require("../../lib/posts/recordPostView");

    const result = await recordPostView(verifiedRequest({ postId: "post-1" }));

    expect(result).toEqual({ success: true });
    expect(env.writes).toEqual([]);
  });
});
