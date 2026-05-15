const { setupCallableTestEnv } = require("./helpers/callableTestEnv");

function createdEvent(post, postId = "post-1", update = jest.fn(async () => undefined), remove = jest.fn(async () => undefined)) {
  return {
    params: { postId },
    data: {
      val: jest.fn(() => post),
      ref: { update, remove }
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
    const env = setupCallableTestEnv({
      translateResult: "Blue Keys",
      onceByPath: {
        "centers/uab": {
          id: "uab",
          bounds: { latMin: 41.48, latMax: 41.52, lngMin: 2.08, lngMax: 2.13 },
          location: { lat: 41.50, lng: 2.10 },
          radius_meters: 1500
        }
      }
    });
    const update = jest.fn(async () => undefined);
    const { onPostCreated } = require("../lib/posts/postTriggers");

    await onPostCreated(createdEvent({
      center_id: "uab",
      status: "active",
      is_deleted: false,
      created_at: 123,
      description: "Llaves azules",
      coords: { lat: 41.50, lng: 2.10 }
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
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => { });
    const env = setupCallableTestEnv({
      translateRejects: new Error("translate failed"),
      onceByPath: {
        "centers/uab": {
          id: "uab",
          bounds: { latMin: 41.48, latMax: 41.52, lngMin: 2.08, lngMax: 2.13 },
          location: { lat: 41.50, lng: 2.10 },
          radius_meters: 1500
        }
      }
    });
    const update = jest.fn(async () => undefined);
    const { onPostCreated } = require("../lib/posts/postTriggers");

    await onPostCreated(createdEvent({
      center_id: "uab",
      status: "active",
      is_deleted: false,
      created_at: 123,
      description: "Llaves azules",
      coords: { lat: 41.50, lng: 2.10 }
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

  test("onPostUpdated syncs title and imageUrl to existing chats", async () => {
    const env = setupCallableTestEnv({
      onceByQuery: {
        "chats|orderByChild:post_id|equalTo:post-1": {
          "chat-1": { post_id: "post-1", post_title: "Viejo título" },
          "chat-2": { post_id: "post-1", post_title: "Viejo título" }
        }
      }
    });

    const { onPostUpdated } = require("../lib/posts/postTriggers");

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

  describe("geographic validation", () => {
    const validCenter = {
      id: "uab",
      location: {
        lat: 41.5008587,
        lng: 2.1042399
      },
      radius_meters: 1500,
      bounds: { latMin: 41.48, latMax: 41.52, lngMin: 2.08, lngMax: 2.13 }
    };

    test("onPostCreated accepts posts within center bounds", async () => {
      const env = setupCallableTestEnv({
        onceByPath: { "centers/uab": validCenter }
      });
      const { onPostCreated } = require("../lib/posts/postTriggers");

      await onPostCreated(createdEvent({
        center_id: "uab",
        status: "active",
        is_deleted: false,
        created_at: 123,
        coords: { lat: 41.5008587, lng: 2.1042399 }
      }));

      expect(env.writes).toContainEqual(expect.objectContaining({
        op: "set",
        path: "active_posts/uab/post-1"
      }));
    });

    test("onPostCreated deletes posts outside center bounds (Haversine)", async () => {
      const env = setupCallableTestEnv({
        onceByPath: { "centers/uab": validCenter }
      });
      const remove = jest.fn(async () => undefined);
      const { onPostCreated } = require("../lib/posts/postTriggers");

      // Coordenadas en Barcelona Centro (~20km de UAB)
      await onPostCreated(createdEvent({
        center_id: "uab",
        status: "active",
        is_deleted: false,
        coords: { lat: 41.385063, lng: 2.173403 }
      }, "post-fail", jest.fn(), remove));

      expect(env.writes).not.toContainEqual(expect.objectContaining({
        path: "active_posts/uab/post-fail"
      }));
      expect(remove).toHaveBeenCalled();
    });

    test("onPostCreated deletes posts outside Bounding Box", async () => {
      const env = setupCallableTestEnv({
        onceByPath: { "centers/uab": validCenter }
      });
      const remove = jest.fn(async () => undefined);
      const { onPostCreated } = require("../lib/posts/postTriggers");

      await onPostCreated(createdEvent({
        center_id: "uab",
        status: "active",
        is_deleted: false,
        coords: { lat: 41.0, lng: 2.0 }
      }, "post-fail-box", jest.fn(), remove));

      expect(remove).toHaveBeenCalled();
    });
  });
});
