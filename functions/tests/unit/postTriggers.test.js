const { setupCallableTestEnv } = require("./helpers/callableTestEnv");

function createdEvent(post, postId = "post-1", update = jest.fn(async () => undefined)) {
  return {
    params: { postId },
    data: {
      val: jest.fn(() => post),
      ref: { update }
    }
  };
}

function updatedEvent(after, postId = "post-1", before = after) {
  return {
    params: { postId },
    data: {
      before: {
        val: jest.fn(() => before)
      },
      after: {
        val: jest.fn(() => after)
      }
    }
  };
}

function deletedEvent(before, postId = "post-1") {
  return {
    params: { postId },
    data: {
      val: jest.fn(() => before)
    }
  };
}

describe("post triggers", () => {
  test("onPostCreated indexes active posts and stores translated descriptions", async () => {
    const env = setupCallableTestEnv({ translateResult: "Blue Keys" });
    const update = jest.fn(async () => undefined);
    const { onPostCreated } = require("../../lib/posts/postTriggers");

    await onPostCreated(createdEvent({
      center_id: "uab",
      status: "active",
      is_deleted: false,
      created_at: 123,
      description: "Llaves azules"
    }, "post-1", update));

    expect(env.writes).toEqual([
      {
        op: "set",
        path: "active_posts/uab/post-1",
        value: 123
      }
    ]);
    expect(env.translateText).toHaveBeenCalledWith("Llaves azules", "es");
    expect(update).toHaveBeenCalledWith({
      translated_description: "blue keys"
    });
  });

  test("onPostCreated does not index posts that are not active", async () => {
    const env = setupCallableTestEnv();
    const { onPostCreated } = require("../../lib/posts/postTriggers");

    await onPostCreated(createdEvent({
      center_id: "uab",
      status: "matched",
      is_deleted: false,
      created_at: 123
    }));

    expect(env.writes).toEqual([]);
    expect(env.translateText).not.toHaveBeenCalled();
  });

  test("onPostCreated keeps indexing when translation fails", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const env = setupCallableTestEnv({ translateRejects: new Error("translate failed") });
    const update = jest.fn(async () => undefined);
    const { onPostCreated } = require("../../lib/posts/postTriggers");

    await onPostCreated(createdEvent({
      center_id: "uab",
      status: "active",
      is_deleted: false,
      created_at: 123,
      description: "Llaves azules"
    }, "post-1", update));

    expect(env.writes).toEqual([
      {
        op: "set",
        path: "active_posts/uab/post-1",
        value: 123
      }
    ]);
    expect(update).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  test("onPostCreated notifies owners of automatic matches above the score threshold", async () => {
    const env = setupCallableTestEnv({
      translateResult: "red keychain",
      onceByPath: {
        "active_posts/uab": {
          "lost-1": 100,
          "lost-low": 101
        },
        "posts/lost-1": {
          id: "lost-1",
          type: "lost",
          category: "keys",
          status: "active",
          is_deleted: false,
          user_id: "owner-1",
          translated_description: "red keychain near library"
        },
        "posts/lost-low": {
          id: "lost-low",
          type: "lost",
          category: "keys",
          status: "active",
          is_deleted: false,
          user_id: "owner-low",
          translated_description: "plain metal"
        },
        "users/owner-1/settings/language": "es",
        "users/owner-1/fcm_tokens": {
          "token-owner-1": true
        }
      }
    });
    const update = jest.fn(async () => undefined);
    const { onPostCreated } = require("../../lib/posts/postTriggers");

    await onPostCreated(createdEvent({
      center_id: "uab",
      status: "active",
      is_deleted: false,
      created_at: 123,
      type: "found",
      category: "keys",
      color: "rojo",
      title: "Llavero rojo",
      description: "Llavero rojo"
    }, "new-post", update));

    expect(env.writes).toContainEqual({
      op: "set",
      path: "active_posts/uab/new-post",
      value: 123
    });
    expect(env.messagingApi.send).toHaveBeenCalledTimes(1);
    expect(env.messagingApi.send).toHaveBeenCalledWith(expect.objectContaining({
      token: "token-owner-1",
      data: expect.objectContaining({
        matchPostId: "new-post",
        matchTitle: "Llavero rojo"
      })
    }));
  });

  test("onPostCreated limits automatic match notifications to the top five scores", async () => {
    const activePosts = {};
    const onceByPath = {
      "active_posts/uab": activePosts
    };
    const words = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"];

    for (let index = 1; index <= 6; index++) {
      const id = `lost-${index}`;
      const userId = `owner-${index}`;
      activePosts[id] = index;
      onceByPath[`posts/${id}`] = {
        id,
        type: "lost",
        category: "keys",
        status: "active",
        is_deleted: false,
        user_id: userId,
        translated_description: words.slice(0, index).join(" ")
      };
      onceByPath[`users/${userId}/settings/language`] = "es";
      onceByPath[`users/${userId}/fcm_tokens`] = {
        [`token-${index}`]: true
      };
    }

    const env = setupCallableTestEnv({
      translateResult: words.join(" "),
      onceByPath
    });
    const { onPostCreated } = require("../../lib/posts/postTriggers");

    await onPostCreated(createdEvent({
      center_id: "uab",
      status: "active",
      is_deleted: false,
      created_at: 123,
      type: "found",
      category: "keys",
      color: "alpha beta gamma delta epsilon zeta",
      title: "Candidate",
      description: "Candidate"
    }, "new-post"));

    const sentTokens = env.messagingApi.send.mock.calls.map(([message]) => message.token);
    expect(sentTokens).toHaveLength(5);
    expect(sentTokens).toEqual(expect.arrayContaining(["token-2", "token-3", "token-4", "token-5", "token-6"]));
    expect(sentTokens).not.toContain("token-1");
  });

  test("onPostCreated keeps indexing when automatic notification lookup fails", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    const notifyMultipleUsersOfMatch = jest.fn().mockRejectedValue(new Error("notify failed"));
    const env = setupCallableTestEnv({
      translateResult: "red keychain",
      onceByPath: {
        "active_posts/uab": {
          "lost-1": 100
        },
        "posts/lost-1": {
          id: "lost-1",
          type: "lost",
          category: "keys",
          status: "active",
          is_deleted: false,
          user_id: "owner-1",
          translated_description: "red keychain"
        }
      }
    });
    jest.doMock(require.resolve("../../lib/shared/notifications"), () => ({
      notifyMultipleUsersOfMatch
    }));
    const { onPostCreated } = require("../../lib/posts/postTriggers");

    await onPostCreated(createdEvent({
      center_id: "uab",
      status: "active",
      is_deleted: false,
      created_at: 123,
      type: "found",
      category: "keys",
      color: "rojo",
      title: "Llavero rojo",
      description: "Llavero rojo"
    }, "new-post"));

    expect(env.writes).toContainEqual({
      op: "set",
      path: "active_posts/uab/new-post",
      value: 123
    });
    expect(notifyMultipleUsersOfMatch).toHaveBeenCalled();
  });

  test("onPostUpdated writes active posts into the active index", async () => {
    const env = setupCallableTestEnv();
    const { onPostUpdated } = require("../../lib/posts/postTriggers");

    await onPostUpdated(updatedEvent({
      center_id: "uab",
      status: "active",
      is_deleted: false,
      created_at: 456
    }, "post-2"));

    expect(env.writes).toEqual([
      {
        op: "set",
        path: "active_posts/uab/post-2",
        value: 456
      }
    ]);
  });

  test("onPostUpdated removes resolved or deleted posts from the active index", async () => {
    const env = setupCallableTestEnv();
    const { onPostUpdated } = require("../../lib/posts/postTriggers");

    await onPostUpdated(updatedEvent({
      center_id: "uab",
      status: "returned",
      is_deleted: false,
      created_at: 456
    }, "post-2"));

    expect(env.writes).toEqual([
      {
        op: "remove",
        path: "active_posts/uab/post-2"
      }
    ]);
  });

  test("onPostDeleted removes physically deleted posts from the active index", async () => {
    const env = setupCallableTestEnv();
    const { onPostDeleted } = require("../../lib/posts/postTriggers");

    await onPostDeleted(deletedEvent({
      center_id: "uab"
    }, "post-3"));

    expect(env.writes).toEqual([
      {
        op: "remove",
        path: "active_posts/uab/post-3"
      }
    ]);
  });

  test("onPostUpdated syncs title and imageUrl to existing chats", async () => {
    const env = setupCallableTestEnv({
      onceByQuery: {
        "chats|orderByChild:post_id|equalTo:post-1": {
          "chat-1": { post_id: "post-1", post_title: "Viejo título" },
          "chat-2": { post_id: "post-1", post_title: "Viejo título" }
        }
      }
    });

    const { onPostUpdated } = require("../../lib/posts/postTriggers");

    const event = {
      params: { postId: "post-1" },
      data: {
        before: { val: () => ({ title: "Viejo título", imageUrl: "old.jpg", center_id: "uab" }) },
        after: { val: () => ({ title: "Nuevo título", imageUrl: "new.jpg", center_id: "uab", status: "active", is_deleted: false, created_at: 123 }) }
      }
    };

    await onPostUpdated(event);

    // Debe haber una operación de 'update' en la raíz con los chats actualizados
    const updateOp = env.writes.find(w => w.op === "update" && w.path === "");
    expect(updateOp.value).toEqual({
      "chats/chat-1/post_title": "Nuevo título",
      "chats/chat-1/post_image_url": "new.jpg",
      "chats/chat-2/post_title": "Nuevo título",
      "chats/chat-2/post_image_url": "new.jpg"
    });
  });
});
