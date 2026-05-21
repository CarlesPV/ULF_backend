const { createTestEnv } = require("./helpers/callableTestEnv");

describe("checkPotentialMatches", () => {
  let env;

  beforeEach(() => {
    env = createTestEnv();
    // La nueva implementación llama translateText una vez por campo (título, desc, location)
    env.translateText.mockImplementation(async (text) => text);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: reads active post ids and returns the highest scoring candidate
  // Score esperado: titleRatio=1.0 (token "llaves" aparece en target title "Llaves azules")
  // "azules" no está en queryTokens, ratio = 1/1 = 1.0 → score = 1.0
  // ─────────────────────────────────────────────────────────────────────────
  test("reads active post ids and returns the highest scoring candidates", async () => {
    env.database.ref("active_posts/center-1/lost").set({ "lost-1": true });
    env.database.ref("posts/lost-1").set({
      id: "lost-1",
      type: "lost",
      category: "keys",
      title: "Llaves azules",
      translated_title: "blue keys",
      description: undefined,
      photo_path: "posts/lost-1.jpg",
      postImageUrl: "",
      is_deleted: false,
      created_at: Date.now(),
    });

    const result = await env.callFunction("checkPotentialMatches", {
      center_id: "center-1",
      category: "keys",
      type: "found",
      title: "Llaves",          // tokeniza a ["llaves"] → match en "blue keys" = 1/1 = 1.0
      description: undefined,
      created_at: Date.now(),
    });

    expect(result).toEqual({
      matches: [
        {
          id: "lost-1",
          title: "Llaves azules",
          description: undefined,
          photo_path: "posts/lost-1.jpg",
          postImageUrl: "",
          score: 1.0,
        },
      ],
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: NO score base — sin título ni descripción, no supera el umbral
  // En la nueva heurística la categoría es filtro, no score. Si no hay
  // título/desc en común, el score es 0 y no se incluye en matches.
  // ─────────────────────────────────────────────────────────────────────────
  test("returns empty matches when only type and category match (no title/desc overlap)", async () => {
    env.database.ref("active_posts/center-1/lost").set({ "lost-1": true });
    env.database.ref("posts/lost-1").set({
      id: "lost-1",
      type: "lost",
      category: "keys",
      title: "Llaves",
      translated_title: "keys",
      description: "Sin detalles",
      photo_path: "posts/lost-1.jpg",
      postImageUrl: "",
      is_deleted: false,
      created_at: Date.now(),
    });

    // Query totalmente diferente al título del target — no hay overlap
    const result = await env.callFunction("checkPotentialMatches", {
      center_id: "center-1",
      category: "keys",
      type: "found",
      title: "Cartera roja",    // "cartera", "roja" → no coinciden con "keys"
      description: "Objeto perdido",
      created_at: Date.now(),
    });

    expect(result).toEqual({ matches: [] });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: fallback to raw terms when translation fails
  // Si translateText lanza error, se usan los tokens originales sin traducir.
  // Con título "Llaves" y target translated_title="keys llavero rojo intenso",
  // "llaves" no matchea → pero si usamos raw terms "llaves" vs raw title "Llaves"
  // el score sería 1.0 si el target title sin traducir contiene "llaves"
  // ─────────────────────────────────────────────────────────────────────────
  test("falls back to raw search terms when translation fails", async () => {
    env.translateText.mockRejectedValue(new Error("Translation unavailable"));

    env.database.ref("active_posts/center-1/lost").set({ "lost-1": true });
    env.database.ref("posts/lost-1").set({
      id: "lost-1",
      type: "lost",
      category: "keys",
      title: "Llaves",
      // Sin translated_title → fallback al campo title raw
      description: "Llavero rojo intenso",
      photo_path: "posts/lost-1.jpg",
      postImageUrl: "",
      is_deleted: false,
      created_at: Date.now(),
    });

    const result = await env.callFunction("checkPotentialMatches", {
      center_id: "center-1",
      category: "keys",
      type: "found",
      title: "Llaves",    // raw token "llaves" matchea en target title raw "llaves" → ratio 1.0
      description: "Llavero metálico",
      created_at: Date.now(),
    });

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].id).toBe("lost-1");
    expect(result.matches[0].score).toBeGreaterThanOrEqual(0.5);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4: ordena por score y limita a 5 — los candidatos deben tener título
  // que matchee para superar el umbral 0.5. Usamos "Candidate" en todos.
  // ─────────────────────────────────────────────────────────────────────────
  test("orders matches by score and limits the response to five", async () => {
    const activeIds = {};
    for (let i = 1; i <= 7; i++) {
      activeIds[`lost-${i}`] = true;
      env.database.ref(`posts/lost-${i}`).set({
        id: `lost-${i}`,
        type: "lost",
        category: "keys",
        // Candidate 6 tiene más palabras coincidentes → mayor score
        title: `Candidate ${i}`,
        translated_title: `candidate ${i}`,
        description: i === 6 ? "candidate keys found special" : undefined,
        photo_path: `posts/lost-${i}.jpg`,
        postImageUrl: "",
        is_deleted: false,
        created_at: Date.now() - i * 1000,
      });
    }
    env.database.ref("active_posts/center-1/lost").set(activeIds);

    const result = await env.callFunction("checkPotentialMatches", {
      center_id: "center-1",
      category: "keys",
      type: "found",
      title: "Candidate Keys",   // tokens: ["candidate", "keys"] → todos los lost-N matchean "candidate"
      description: "special found",
      created_at: Date.now(),
    });

    expect(result.matches).toHaveLength(5);
    // lost-6 debe ser el primero (más palabras en descripción coinciden)
    expect(result.matches[0]).toEqual(
      expect.objectContaining({ id: "lost-6", title: "Candidate 6" })
    );
    // Todos los scores deben estar ordenados descendentemente
    const scores = result.matches.map((m) => m.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 5: translateText se llama por campo (título y descripción por separado)
  // La nueva implementación llama translateText(title, lang) y translateText(desc, lang)
  // de forma independiente — NO concatenada como antes.
  // ─────────────────────────────────────────────────────────────────────────
  test("translates title and description separately (not concatenated)", async () => {
    env.translateText.mockImplementation(async (text) => text);

    env.database.ref("active_posts/center-1/lost").set({ "lost-special": true });
    env.database.ref("posts/lost-special").set({
      id: "lost-special",
      type: "lost",
      category: "keys",
      title: "Special Keys",
      translated_title: "special keys",
      description: "special keychain some other details",
      photo_path: "posts/lost-special.jpg",
      postImageUrl: "",
      is_deleted: false,
      created_at: Date.now(),
    });

    await env.callFunction("checkPotentialMatches", {
      center_id: "center-1",
      category: "keys",
      type: "found",
      title: "especial",
      description: "llavero azul",
      created_at: Date.now(),
    });

    // Título y descripción se traducen POR SEPARADO, no concatenados
    expect(env.translateText).toHaveBeenCalledWith("especial", "es");
    expect(env.translateText).toHaveBeenCalledWith("llavero azul", "es");
    // NO debe llamarse con la concatenación de ambos
    expect(env.translateText).not.toHaveBeenCalledWith("especial llavero azul", "es");
    expect(env.translateText).not.toHaveBeenCalledWith("especial azul llavero", "es");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 6: score de imagen — bonus +0.25 si ambos posts tienen imagen
  // ─────────────────────────────────────────────────────────────────────────
  test("awards image bonus when both source and target post have an image", async () => {
    env.database.ref("active_posts/center-1/lost").set({ "lost-img": true });
    env.database.ref("posts/lost-img").set({
      id: "lost-img",
      type: "lost",
      category: "keys",
      title: "Llaves",
      translated_title: "keys",
      photo_path: "posts/lost-img.jpg",
      postImageUrl: "https://example.com/img.jpg",  // tiene imagen
      is_deleted: false,
      created_at: Date.now(),
    });

    const result = await env.callFunction("checkPotentialMatches", {
      center_id: "center-1",
      category: "keys",
      type: "found",
      title: "Llaves",
      postImageUrl: "https://example.com/my.jpg",   // también tiene imagen
      created_at: Date.now(),
    });

    expect(result.matches).toHaveLength(1);
    // score = titleRatio(1.0) + imageBonus(0.25) = 1.25
    expect(result.matches[0].score).toBeCloseTo(1.25, 1);
  });
});