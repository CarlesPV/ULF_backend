const {
  adminDb,
  callFunction,
  createClientApp,
  createVerifiedUser,
  resetEmulators,
  signInClient
} = require("./helpers/firebaseEmulatorTestEnv");

function post(id, overrides = {}) {
  return {
    id,
    user_id: overrides.user_id || "owner-1",
    center_id: "uab",
    type: "lost",
    title: "Mochila roja",
    description: "",
    translated_description: "",
    category: "bags",
    status: "active",
    coords: {
      lat: 41.5008587,
      lng: 2.1042399,
      geohash: "sp3e"
    },
    photo_path: "",
    vision_labels: [],
    created_at: overrides.created_at || Date.now(),
    updated_at: overrides.updated_at || Date.now(),
    is_deleted: false,
    ...overrides
  };
}

describe("integration: feed and matching", () => {
  beforeEach(async () => {
    await resetEmulators();
    await createVerifiedUser({
      uid: "searcher-1",
      email: "searcher@uab.cat"
    });
  });

  test("getFilteredFeed returns active posts filtered by type and category", async () => {
    await adminDb().ref().update({
      "posts/lost-bag": post("lost-bag", {
        type: "lost",
        category: "bags",
        title: "Mochila roja biblioteca",
        vision_labels: ["mochila", "roja"],
        created_at: 2000
      }),
      "posts/feed-lost-keys": post("feed-lost-keys", {
        type: "lost",
        category: "keys",
        title: "Llaves",
        created_at: 3000
      }),
      "posts/found-bag": post("found-bag", {
        type: "found",
        category: "bags",
        title: "Mochila encontrada",
        created_at: 4000
      }),
      "active_posts/uab/lost-bag": 2000,
      "active_posts/uab/feed-lost-keys": 3000,
      "active_posts/uab/found-bag": 4000,
      "active_posts/uab/lost/lost-bag": 2000,
      "active_posts/uab/lost/feed-lost-keys": 3000,
      "active_posts/uab/found/found-bag": 4000
    });
    const client = await signInClient(createClientApp(), "searcher@uab.cat");

    const result = await callFunction(client, "getFilteredFeed", {
      center_id: "uab",
      type: "lost",
      category: "bags"
    });

    expect(result.data.feed.map((item) => item.id)).toEqual(["lost-bag"]);
  });

  test("checkPotentialMatches returns opposite-type candidates and excludes invalid posts", async () => {
    await adminDb().ref().update({
      "posts/lost-keys": post("lost-keys", {
        user_id: "owner-1",
        type: "lost",
        category: "keys",
        title: "Llaves rojas",
        description: "",
        translated_description: "llavero rojo biblioteca",
        created_at: 2000
      }),
      "posts/lost-wallet": post("lost-wallet", {
        user_id: "owner-2",
        type: "lost",
        category: "wallets",
        title: "Cartera",
        translated_description: "cartera negra",
        created_at: 3000
      }),
      "posts/found-keys": post("found-keys", {
        user_id: "owner-3",
        type: "found",
        category: "keys",
        title: "Llaves encontradas",
        translated_description: "llavero rojo",
        created_at: 4000
      }),
      "posts/deleted-keys": post("deleted-keys", {
        user_id: "owner-4",
        type: "lost",
        category: "keys",
        title: "Borrado",
        translated_description: "llavero rojo",
        is_deleted: true,
        created_at: 5000
      }),
      "active_posts/uab/lost-keys": 2000,
      "active_posts/uab/lost-wallet": 3000,
      "active_posts/uab/found-keys": 4000,
      "active_posts/uab/deleted-keys": 5000,
      "active_posts/uab/lost/lost-keys": 2000,
      "active_posts/uab/lost/lost-wallet": 3000,
      "active_posts/uab/found/found-keys": 4000,
      "active_posts/uab/lost/deleted-keys": 5000
    });
    const client = await signInClient(createClientApp(), "searcher@uab.cat");

    const result = await callFunction(client, "checkPotentialMatches", {
      center_id: "uab",
      type: "found",
      category: "keys",
      title: "Llaves encontradas",
      description: "llavero rojo",
      created_at: 4000
    });

    expect(result.data.matches).toEqual([
      expect.objectContaining({
        id: "lost-keys",
        title: "Llaves rojas",
        score: expect.any(Number)
      })
    ]);
  });
});
