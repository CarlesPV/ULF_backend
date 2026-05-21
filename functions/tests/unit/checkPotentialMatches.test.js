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

describe("checkPotentialMatches", () => {
  test("rejects users without a verified email", async () => {
    setupCallableTestEnv();
    const { checkPotentialMatches } = require("../../lib/matcher/checkPotentialMatches");

    await expect(checkPotentialMatches({
      auth: {
        uid: "user-1",
        token: { email_verified: false }
      },
      data: {
        center_id: "uab",
        type: "found",
        category: "keys"
      }
    })).rejects.toMatchObject({ code: "permission-denied" });
  });

  test("rejects incomplete match requests", async () => {
    setupCallableTestEnv();
    const { checkPotentialMatches } = require("../../lib/matcher/checkPotentialMatches");

    await expect(checkPotentialMatches(verifiedRequest({
      center_id: "uab",
      type: "found"
    }))).rejects.toMatchObject({ code: "invalid-argument" });
  });

  test("reads active post ids and returns the highest scoring candidates", async () => {
    const env = setupCallableTestEnv({
      onceByPath: {
        "active_posts/uab/lost": {
          "lost-1": 100,
          "found-1": 101,
          "deleted-1": 102
        },
        "posts/lost-1": {
          id: "lost-1",
          type: "lost",
          category: "keys",
          is_deleted: false,
          title: "Llaves azules",
          translated_description: "blue ribbon keychain",
          photo_path: "posts/lost-1.jpg"
        },
        "posts/found-1": {
          id: "found-1",
          type: "found",
          category: "keys",
          is_deleted: false,
          title: "Otro post",
          translated_description: "blue ribbon",
          photo_path: "posts/found-1.jpg"
        },
        "posts/deleted-1": {
          id: "deleted-1",
          type: "lost",
          category: "keys",
          is_deleted: true,
          title: "Borrado",
          translated_description: "blue ribbon",
          photo_path: "posts/deleted-1.jpg"
        }
      },
      translateResult: "blue ribbon"
    });
    const { checkPotentialMatches } = require("../../lib/matcher/checkPotentialMatches");

    const result = await checkPotentialMatches(verifiedRequest({
      center_id: "uab",
      type: "found",
      category: "keys",
      description: "cinta"
    }));

    expect(result).toEqual({
      matches: [
        {
          id: "lost-1",
          title: "Llaves azules",
          description: undefined,
          score: 0.5,
          photo_path: "posts/lost-1.jpg",
          postImageUrl: ""
        }
      ]
    });
    expect(env.refMock).toHaveBeenCalledWith("active_posts/uab/lost");
    expect(env.refMock).toHaveBeenCalledWith("posts/lost-1");
    expect(env.translateText).toHaveBeenCalledWith("cinta", "es");
  });

  test("returns an empty list when the active index has no entries", async () => {
    setupCallableTestEnv({
      onceByPath: {
        "active_posts/uab/lost": null
      },
      translateResult: "blue"
    });
    const { checkPotentialMatches } = require("../../lib/matcher/checkPotentialMatches");

    const result = await checkPotentialMatches(verifiedRequest({
      center_id: "uab",
      type: "found",
      category: "keys"
    }));

    expect(result).toEqual({ matches: [] });
  });

  test("ignores active index entries whose post snapshot no longer exists", async () => {
    setupCallableTestEnv({
      onceByPath: {
        "active_posts/uab/lost": {
          "missing-1": 100
        },
        "posts/missing-1": null
      }
    });
    const { checkPotentialMatches } = require("../../lib/matcher/checkPotentialMatches");

    const result = await checkPotentialMatches(verifiedRequest({
      center_id: "uab",
      type: "found",
      category: "keys"
    }));

    expect(result).toEqual({ matches: [] });
  });


  test("returns base score with title matching when only query title is provided", async () => {
    const env = setupCallableTestEnv({
      onceByPath: {
        "active_posts/uab/lost": {
          "lost-1": 100,
          "lost-wallet": 101,
          "found-1": 102
        },
        "posts/lost-1": {
          id: "lost-1",
          type: "lost",
          category: "keys",
          is_deleted: false,
          title: "Llaves azules",
          translated_title: "blue keys",
          description: "Sin detalles",
          photo_path: "posts/lost-1.jpg"
        },
        "posts/lost-wallet": {
          id: "lost-wallet",
          type: "lost",
          category: "wallet",
          is_deleted: false,
          title: "Cartera",
          translated_title: "wallet",
          description: "Negra",
          photo_path: "posts/lost-wallet.jpg"
        },
        "posts/found-1": {
          id: "found-1",
          type: "found",
          category: "keys",
          is_deleted: false,
          title: "Llaves encontradas",
          description: "Azules",
          photo_path: "posts/found-1.jpg"
        }
      },
      
    });
    const { checkPotentialMatches } = require("../../lib/matcher/checkPotentialMatches");

    const result = await checkPotentialMatches(verifiedRequest({
      center_id: "uab",
      type: "found",
      category: "keys",
      title: "llaves"
    }));

    expect(result).toEqual({
      matches: [
        {
          id: "lost-1",
          title: "Llaves azules",
          description: "Sin detalles",
          score: 0.5,
          photo_path: "posts/lost-1.jpg",
          postImageUrl: ""
        }
      ]
    });
    expect(env.translateText).toHaveBeenCalledWith("llaves", "es");
  });

  test("falls back to raw search terms when translation fails", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    setupCallableTestEnv({
      onceByPath: {
        "active_posts/uab/lost": {
          "lost-1": 100
        },
        "posts/lost-1": {
          id: "lost-1",
          type: "lost",
          category: "keys",
          is_deleted: false,
          title: "Llaves",
          translated_title: "Llaves",
          description: "Llavero rojo intenso",
          translated_description: "Llavero rojo intenso",
          photo_path: "posts/lost-1.jpg"
        }
      },
      translateRejects: new Error("translate failed")
    });
    const { checkPotentialMatches } = require("../../lib/matcher/checkPotentialMatches");

    const result = await checkPotentialMatches(verifiedRequest({
      center_id: "uab",
      type: "found",
      category: "keys",
      description: "rojo"
    }));

    expect(result).toEqual({
      matches: [
        {
          id: "lost-1",
          title: "Llaves",
          description: "Llavero rojo intenso",
          score: 0.5,
          photo_path: "posts/lost-1.jpg",
          postImageUrl: ""
        }
      ]
    });
    expect(errorSpy).toHaveBeenCalled();
  });

  test("orders matches by score and limits the response to five", async () => {
    const activePosts = {};
    const posts = {};

    for (let index = 1; index <= 6; index++) {
      const id = `lost-${index}`;
      activePosts[id] = index * 1000;
      posts[`posts/${id}`] = {
        id,
        type: "lost",
        category: "keys",
        is_deleted: false,
        title: `Candidate ${index}`,
        translated_description: index === 6 ? "alpha beta gamma" : "alpha",
        photo_path: `posts/${id}.jpg`,
        created_at: index * 1000
      };
    }

    setupCallableTestEnv({
      onceByPath: {
        "active_posts/uab/lost": activePosts,
        ...posts
      },
      translateResult: "alpha beta gamma"
    });
    const { checkPotentialMatches } = require("../../lib/matcher/checkPotentialMatches");

    const result = await checkPotentialMatches(verifiedRequest({
      center_id: "uab",
      type: "found",
      category: "keys",
      description: "alpha beta gamma",
      created_at: 7000
    }));

    expect(result.matches).toHaveLength(5);
    // lost-6: 2/3 terms match in desc (0.5 * 2 / 3 ≈ 0.333, capped to 0.5) + date proximity bonus
    // Others: 1/3 terms match (0.5 * 1 / 3 ≈ 0.167, below 0.5 base, filtered)
    // Expected: top 5 based on scores and then by creation date
    expect(result.matches[0].id).toBe("lost-6");
    expect(result.matches[0].score).toBeGreaterThanOrEqual(0.5);
  });

  test("includes title and description in search terms and scores based on matches", async () => {
    const env = setupCallableTestEnv({
      onceByPath: {
        "active_posts/uab/lost": {
          "lost-special": 100,
          "lost-normal": 101
        },
        "posts/lost-special": {
          id: "lost-special",
          type: "lost",
          category: "keys",
          is_deleted: false,
          title: "Special keychain",
          translated_title: "special keychain",
          translated_description: "blue ribbon keychain",
          photo_path: "posts/lost-special.jpg",
          created_at: 100
        },
        "posts/lost-normal": {
          id: "lost-normal",
          type: "lost",
          category: "keys",
          is_deleted: false,
          title: "Ordinary keys",
          translated_title: "ordinary keys",
          translated_description: "some other details",
          photo_path: "posts/lost-normal.jpg",
          created_at: 101
        }
      },
      translateResult: "special blue ribbon"
    });
    const { checkPotentialMatches } = require("../../lib/matcher/checkPotentialMatches");

    const result = await checkPotentialMatches(verifiedRequest({
      center_id: "uab",
      type: "found",
      category: "keys",
      title: "special",
      description: "blue ribbon",
      created_at: 100
    }));

    // Expect title translation: "special" → "special"
    // Expect description translation: "blue ribbon" → "special blue ribbon"
    expect(env.translateText).toHaveBeenCalledWith("special", "es");
    expect(env.translateText).toHaveBeenCalledWith("blue ribbon", "es");

    // Query tokens: ["special", "blue", "ribbon"]
    // lost-special: title match (special ✓, keychain ✗) + desc match (special ✓, blue ✓, ribbon ✓, keychain ✓)
    //   titleRatio = 1/3 → titleScore = 1/3 * 1.0 ≈ 0.333
    //   descRatio = 3/3 → descScore = min(1.0 * 0.5 * 2, 0.5) = 0.5
    //   Total ≈ 0.833
    // lost-normal: title match (ordinary ✗, keys ✗) + desc no matches
    //   Scores too low, filtered out
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches[0].id).toBe("lost-special");
  });
});
