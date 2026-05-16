const { setupCallableTestEnv } = require("./helpers/callableTestEnv");

function verifiedRequest(data = {}, uid = "owner-1") {
  return {
    auth: {
      uid,
      token: { email_verified: true }
    },
    data
  };
}

describe("updatePostStatus", () => {
  test("rejects users without a verified email", async () => {
    setupCallableTestEnv();
    const { updatePostStatus } = require("../../lib/posts/updatePostStatus");

    await expect(updatePostStatus({
      auth: {
        uid: "owner-1",
        token: { email_verified: false }
      },
      data: { postId: "post-1", newStatus: "returned" }
    })).rejects.toMatchObject({ code: "unauthenticated" });
  });

  test("rejects missing posts", async () => {
    setupCallableTestEnv({
      onceByPath: {
        "posts/post-1": null
      }
    });
    const { updatePostStatus } = require("../../lib/posts/updatePostStatus");

    await expect(updatePostStatus(verifiedRequest({
      postId: "post-1",
      newStatus: "returned"
    }))).rejects.toMatchObject({ code: "not-found" });
  });

  test("rejects users that do not own the post", async () => {
    setupCallableTestEnv({
      onceByPath: {
        "posts/post-1": { user_id: "owner-1" }
      }
    });
    const { updatePostStatus } = require("../../lib/posts/updatePostStatus");

    await expect(updatePostStatus(verifiedRequest({
      postId: "post-1",
      newStatus: "returned"
    }, "other-user"))).rejects.toMatchObject({ code: "permission-denied" });
  });

  test("updates status when the authenticated user owns the post", async () => {
    const env = setupCallableTestEnv({
      onceByPath: {
        "posts/post-1": { user_id: "owner-1", status: "active" }
      }
    });
    const { updatePostStatus } = require("../../lib/posts/updatePostStatus");

    const result = await updatePostStatus(verifiedRequest({
      postId: "post-1",
      newStatus: "returned"
    }));

    expect(result).toEqual({ success: true });
    expect(env.writes).toEqual([
      {
        op: "update",
        path: "posts/post-1",
        value: {
          status: "returned",
          updated_at: 1700000000000
        }
      }
    ]);
  });
});
