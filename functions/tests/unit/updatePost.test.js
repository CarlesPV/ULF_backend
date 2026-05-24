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

describe("updatePost", () => {
  const validCenter = {
    id: "uab",
    location: { lat: 41.5, lng: 2.1 },
    radius_meters: 1000
  };

  const existingPost = {
    id: "post-1",
    user_id: "owner-1",
    center_id: "uab",
    type: "lost",
    category: "bags",
    title: "Mochila",
    status: "active"
  };

  test("rejects users without a verified email", async () => {
    setupCallableTestEnv();
    const { updatePost } = require("../../lib/posts/updatePost");

    await expect(updatePost({
      auth: {
        uid: "owner-1",
        token: { email_verified: false }
      },
      data: { postId: "post-1", updates: { title: "Nuevo" } }
    })).rejects.toMatchObject({ code: "permission-denied" });
  });

  test("rejects missing posts", async () => {
    setupCallableTestEnv({
      onceByPath: {
        "posts/post-1": null
      }
    });
    const { updatePost } = require("../../lib/posts/updatePost");

    await expect(updatePost(verifiedRequest({
      postId: "post-1",
      updates: { title: "Nuevo" }
    }))).rejects.toMatchObject({ code: "not-found" });
  });

  test("rejects users that do not own the post", async () => {
    setupCallableTestEnv({
      onceByPath: {
        "posts/post-1": existingPost
      }
    });
    const { updatePost } = require("../../lib/posts/updatePost");

    await expect(updatePost(verifiedRequest({
      postId: "post-1",
      updates: { title: "Nuevo" }
    }, "other-user"))).rejects.toMatchObject({ code: "permission-denied" });
  });

  test("accepts and updates valid fields", async () => {
    const env = setupCallableTestEnv({
      onceByPath: {
        "posts/post-1": existingPost
      }
    });
    const { updatePost } = require("../../lib/posts/updatePost");

    const result = await updatePost(verifiedRequest({
      postId: "post-1",
      updates: {
        title: " Mochila nueva ",
        description: "Nueva mochila escolar"
      }
    }));

    expect(result).toEqual({ success: true });
    expect(env.writes).toEqual([
      {
        op: "update",
        path: "posts/post-1",
        value: {
          title: "Mochila nueva",
          description: "Nueva mochila escolar",
          updated_at: 1700000000000
        }
      }
    ]);
  });

  test("rejects invalid categories", async () => {
    setupCallableTestEnv({
      onceByPath: {
        "posts/post-1": existingPost
      }
    });
    const { updatePost } = require("../../lib/posts/updatePost");

    await expect(updatePost(verifiedRequest({
      postId: "post-1",
      updates: { category: "invalid-category" }
    }))).rejects.toMatchObject({ code: "invalid-argument" });
  });

  test("rejects out-of-range coordinates", async () => {
    setupCallableTestEnv({
      onceByPath: {
        "posts/post-1": existingPost,
        "centers/uab": validCenter
      }
    });
    const { updatePost } = require("../../lib/posts/updatePost");

    await expect(updatePost(verifiedRequest({
      postId: "post-1",
      updates: {
        coords: { lat: 42.0, lng: 3.0 } // Far away
      }
    }))).rejects.toMatchObject({ code: "out-of-range" });
  });

  test("accepts coordinates within the geofence and writes geohash", async () => {
    const env = setupCallableTestEnv({
      onceByPath: {
        "posts/post-1": existingPost,
        "centers/uab": validCenter
      }
    });
    const { updatePost } = require("../../lib/posts/updatePost");

    const result = await updatePost(verifiedRequest({
      postId: "post-1",
      updates: {
        coords: { lat: 41.5005, lng: 2.1005 } // Inside (distance < 1000m)
      }
    }));

    expect(result).toEqual({ success: true });
    const updateOp = env.writes.find(w => w.op === "update" && w.path === "posts/post-1");
    expect(updateOp).toBeDefined();
    expect(updateOp.value.coords).toBeDefined();
    expect(updateOp.value.coords.lat).toBe(41.5005);
    expect(updateOp.value.coords.lng).toBe(2.1005);
    expect(updateOp.value.coords.geohash).toBeDefined();
  });
});
