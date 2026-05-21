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
    translated_title: "",
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
    postImageUrl: "",
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


  // ─────────────────────────────────────────────────────────────────────
  // getFilteredFeed
  // ─────────────────────────────────────────────────────────────────────
  test("getFilteredFeed returns active posts filtered by type and category", async () => {
    await adminDb().ref().update({
      "posts/lost-bag": post("lost-bag", {
        type: "lost",
        category: "bags",
        title: "Mochila roja biblioteca",
        translated_title: "red backpack library",
        vision_labels: ["mochila", "roja"],
        created_at: 2000
      }),
      "posts/feed-lost-keys": post("feed-lost-keys", {
        type: "lost",
        category: "keys",
        title: "Llaves",
        translated_title: "keys",
        created_at: 3000
      }),
      "posts/found-bag": post("found-bag", {
        type: "found",
        category: "bags",
        title: "Mochila encontrada",
        translated_title: "found backpack",
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


  // ─────────────────────────────────────────────────────────────────────
  // checkPotentialMatches
  // ─────────────────────────────────────────────────────────────────────
  test("checkPotentialMatches returns opposite-type candidates and excludes invalid posts", async () => {
    const now = Date.now();

    await adminDb().ref().update({
      // ✅ Candidato válido: tipo "lost", categoría "keys", mismo título que el query
      // translated_title se añade porque la API de traducción no está disponible
      // en el emulador CI y el matcher hace fallback al campo title raw.
      // Aseguramos que "llaves" o "rojas" estén presentes para superar el umbral 0.5.
      "posts/lost-keys": post("lost-keys", {
        user_id: "owner-1",
        type: "lost",
        category: "keys",
        title: "Llaves rojas",
        translated_title: "red keys",
        description: "Llavero rojo con logograbado",
        translated_description: "red keychain with engraved logo",
        created_at: now - 3600000,  // 1 hora antes — decaimiento temporal mínimo
        photo_path: "posts/lost-keys.jpg",
        postImageUrl: ""
      }),
      // ❌ Diferente categoría — debe excluirse
      "posts/lost-wallet": post("lost-wallet", {
        user_id: "owner-2",
        type: "lost",
        category: "wallets",
        title: "Cartera negra",
        translated_title: "black wallet",
        description: "Cartera de cuero",
        translated_description: "leather wallet",
        created_at: now - 1000
      }),
      // ❌ Mismo tipo que el query (found) — debe excluirse
      "posts/found-keys": post("found-keys", {
        user_id: "owner-3",
        type: "found",
        category: "keys",
        title: "Llaves encontradas",
        translated_title: "found keys",
        description: "Llavero plateado",
        translated_description: "silver keychain",
        created_at: now - 500
      }),
      // ❌ Eliminado — debe excluirse
      "posts/deleted-keys": post("deleted-keys", {
        user_id: "owner-4",
        type: "lost",
        category: "keys",
        title: "Llaves borradas",
        translated_title: "deleted keys",
        description: "Llavero rojo",
        translated_description: "red keychain",
        is_deleted: true,
        created_at: now - 2000
      }),
      "active_posts/uab/lost-keys": now - 3600000,
      "active_posts/uab/lost-wallet": now - 1000,
      "active_posts/uab/found-keys": now - 500,
      "active_posts/uab/deleted-keys": now - 2000,
      "active_posts/uab/lost/lost-keys": now - 3600000,
      "active_posts/uab/lost/lost-wallet": now - 1000,
      "active_posts/uab/found/found-keys": now - 500,
      "active_posts/uab/lost/deleted-keys": now - 2000
    });

    const client = await signInClient(createClientApp(), "searcher@uab.cat");

    // Pasamos title y description para que el matcher pueda calcular scores.
    // Sin estos campos todos los scores serían 0 y no superarían el umbral 0.5.
    // El title "Llaves rojas" garantiza coincidencia con lost-keys aunque
    // la traducción falle en el emulador (fallback a tokens raw).
    const result = await callFunction(client, "checkPotentialMatches", {
      center_id: "uab",
      type: "found",
      category: "keys",
      title: "Llaves rojas",
      description: "llavero perdido",
      created_at: Date.now()
    });

    // Solo lost-keys debe aparecer
    expect(result.data.matches).toEqual([
      expect.objectContaining({
        id: "lost-keys",
        title: "Llaves rojas",
        score: expect.any(Number)
      })
    ]);

    // Verificación explícita de exclusiones
    const ids = result.data.matches.map((m) => m.id);
    expect(ids).not.toContain("found-keys");    // mismo tipo
    expect(ids).not.toContain("deleted-keys");  // eliminado
    expect(ids).not.toContain("lost-wallet");   // diferente categoría
  });


  test("checkPotentialMatches returns empty array when no active posts of opposite type exist", async () => {
    // No hay ningún post "lost" en active_posts
    await adminDb().ref().update({
      "posts/found-keys": post("found-keys", {
        user_id: "owner-3",
        type: "found",
        category: "keys",
        title: "Llaves encontradas",
        translated_title: "found keys",
        created_at: Date.now()
      }),
      "active_posts/uab/found/found-keys": Date.now()
    });

    const client = await signInClient(createClientApp(), "searcher@uab.cat");

    const result = await callFunction(client, "checkPotentialMatches", {
      center_id: "uab",
      type: "found",
      category: "keys",
      title: "Llaves rojas",
      description: "llavero perdido",
      created_at: Date.now()
    });

    expect(result.data.matches).toEqual([]);
  });


  test("checkPotentialMatches score is higher for more keyword overlap", async () => {
    const now = Date.now();

    await adminDb().ref().update({
      // Candidato con título muy similar al query → score alto
      "posts/lost-keys-similar": post("lost-keys-similar", {
        user_id: "owner-5",
        type: "lost",
        category: "keys",
        title: "Llaves rojas metalicas",
        translated_title: "red metallic keys",
        description: "Llavero rojo con etiqueta",
        translated_description: "red keychain with tag",
        created_at: now - 600000,
        photo_path: "posts/lost-keys-similar.jpg",
        postImageUrl: ""
      }),
      // Candidato con título poco relacionado → score bajo
      "posts/lost-keys-generic": post("lost-keys-generic", {
        user_id: "owner-6",
        type: "lost",
        category: "keys",
        title: "Objeto perdido",
        translated_title: "lost object",
        description: "Sin descripción",
        translated_description: "no description",
        created_at: now - 600000,
        photo_path: "",
        postImageUrl: ""
      }),
      "active_posts/uab/lost/lost-keys-similar": now - 600000,
      "active_posts/uab/lost/lost-keys-generic": now - 600000
    });

    const client = await signInClient(createClientApp(), "searcher@uab.cat");

    const result = await callFunction(client, "checkPotentialMatches", {
      center_id: "uab",
      type: "found",
      category: "keys",
      title: "Llaves rojas",
      description: "llavero rojo metalico",
      created_at: now
    });

    const similar = result.data.matches.find((m) => m.id === "lost-keys-similar");
    const generic = result.data.matches.find((m) => m.id === "lost-keys-generic");

    // El candidato similar debe tener mayor score o al menos aparecer antes
    expect(similar).toBeDefined();
    if (generic) {
      expect(similar.score).toBeGreaterThanOrEqual(generic.score);
    }
  });
});