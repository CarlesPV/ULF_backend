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

function updatedEvent(after, postId = "post-1") {
  return {
    params: { postId },
    data: {
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
    const { onPostCreated } = require("../lib/posts/postTriggers");

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
    const { onPostCreated } = require("../lib/posts/postTriggers");

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
    const { onPostCreated } = require("../lib/posts/postTriggers");

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

  test("onPostUpdated writes active posts into the active index", async () => {
    const env = setupCallableTestEnv();
    const { onPostUpdated } = require("../lib/posts/postTriggers");

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
    const { onPostUpdated } = require("../lib/posts/postTriggers");

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
    const { onPostDeleted } = require("../lib/posts/postTriggers");

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
});
