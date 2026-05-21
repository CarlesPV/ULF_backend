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
        translated_title: "red keys",
        description: "Llavero con cinta azul",
        translated_description: "red keychain with blue ribbon",
        created_at: 2000
      }),
      "posts/lost-wallet": post("lost-wallet", {
        user_id: "owner-2",
        type: "lost",
        category: "wallets",
        title: "Cartera",
        translated_title: "wallet",
        description: "Cartera negra de piel",
        translated_description: "black leather wallet",
        created_at: 3000
      }),
      "posts/found-keys": post("found-keys", {
        user_id: "owner-3",
        type: "found",
        category: "keys",
        title: "Llaves encontradas",
        translated_title: "found keys",
        description: "Llavero rojo",
        translated_description: "red keychain",
        created_at: 4000
      }),
      "posts/deleted-keys": post("deleted-keys", {
        user_id: "owner-4",
        type: "lost",
        category: "keys",
        title: "Borrado",
        translated_title: "deleted",
        description: "Llavero rojo con cinta",
        translated_description: "red keychain with ribbon",
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
      category: "keys"
    });

    expect(result.data.matches).toEqual([
      expect.objectContaining({
        id: "lost-keys",
        title: "Llaves rojas",
        score: expect.any(Number)
      })
    ]);
  });

  test("checkPotentialMatches returns candidates with higher scores when description matches", async () => {
    await adminDb().ref().update({
      "posts/lost-blue-keys": post("lost-blue-keys", {
        user_id: "owner-1",
        type: "lost",
        category: "keys",
        title: "Llaves",
        translated_title: "keys",
        description: "Llavero azul con cinta",
        translated_description: "blue keychain with ribbon",
        created_at: 2000
      }),
      "posts/lost-red-keys": post("lost-red-keys", {
        user_id: "owner-2",
        type: "lost",
        category: "keys",
        title: "Llaves",
        translated_title: "keys",
        description: "Llavero rojo",
        translated_description: "red keychain",
        created_at: 3000
      }),
      "active_posts/uab/lost-blue-keys": 2000,
      "active_posts/uab/lost-red-keys": 3000,
      "active_posts/uab/lost/lost-blue-keys": 2000,
      "active_posts/uab/lost/lost-red-keys": 3000
    });
    const client = await signInClient(createClientApp(), "searcher@uab.cat");

    const result = await callFunction(client, "checkPotentialMatches", {
      center_id: "uab",
      type: "found",
      category: "keys",
      description: "azul cinta"
    });

    expect(result.data.matches.length).toBeGreaterThan(0);
    expect(result.data.matches[0].id).toBe("lost-blue-keys");
  });
});
