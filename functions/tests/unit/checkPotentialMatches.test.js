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
          translated_title: "blue keys",
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
      }
    });

    env.translateText
      .mockResolvedValueOnce("keys")
      .mockResolvedValueOnce("blue ribbon");

    const { checkPotentialMatches } = require("../../lib/matcher/checkPotentialMatches");

    const result = await checkPotentialMatches(verifiedRequest({
      center_id: "uab",
      type: "found",
      category: "keys",
      title: "llaves",
      description: "cinta"
    }));

    expect(result).toEqual({
      matches: [
        {
          id: "lost-1",
          title: "Llaves azules",
          description: undefined,
          score: 1.6,
          photo_path: "posts/lost-1.jpg",
          postImageUrl: ""
        }
      ]
    });
    expect(env.refMock).toHaveBeenCalledWith("active_posts/uab/lost");
    expect(env.refMock).toHaveBeenCalledWith("posts/lost-1");
    expect(env.translateText).toHaveBeenCalledWith("llaves", "es");
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


  test("excludes candidates when they only match type and category but score is below threshold", async () => {
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
          title: "Llaves",
          description: "Sin detalles",
          photo_path: "posts/lost-1.jpg"
        },
        "posts/lost-wallet": {
          id: "lost-wallet",
          type: "lost",
          category: "wallet",
          is_deleted: false,
          title: "Cartera",
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
      }
    });
    const { checkPotentialMatches } = require("../../lib/matcher/checkPotentialMatches");

    const result = await checkPotentialMatches(verifiedRequest({
      center_id: "uab",
      type: "found",
      category: "keys"
    }));

    expect(result).toEqual({ matches: [] });
    expect(env.translateText).not.toHaveBeenCalled();
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
          description: "Llavero rojo intenso",
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
      title: "llaves",
      description: "rojo"
    }));

    expect(result).toEqual({
      matches: [
        {
          id: "lost-1",
          title: "Llaves",
          description: "Llavero rojo intenso",
          score: 1.6,
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
      activePosts[id] = index;
      posts[`posts/${id}`] = {
        id,
        type: "lost",
        category: "keys",
        is_deleted: false,
        title: `Candidate ${index}`,
        translated_description: index === 6 ? "keys" : "other",
        photo_path: `posts/${id}.jpg`
      };
    }

    const env = setupCallableTestEnv({
      onceByPath: {
        "active_posts/uab/lost": activePosts,
        ...posts
      }
    });
    env.translateText
      .mockResolvedValueOnce("candidate")
      .mockResolvedValueOnce("keys");

    const { checkPotentialMatches } = require("../../lib/matcher/checkPotentialMatches");

    const result = await checkPotentialMatches(verifiedRequest({
      center_id: "uab",
      type: "found",
      category: "keys",
      title: "candidate",
      description: "keys"
    }));

    expect(result.matches).toHaveLength(5);
    expect(result.matches[0]).toEqual({
      id: "lost-6",
      title: "Candidate 6",
      description: undefined,
      score: 1.6,
      photo_path: "posts/lost-6.jpg",
      postImageUrl: ""
    });
  });

  test("includes title in search terms and awards score bonus for matching words in the target post title", async () => {
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
          translated_description: "some other details",
          photo_path: "posts/lost-special.jpg"
        },
        "posts/lost-normal": {
          id: "lost-normal",
          type: "lost",
          category: "keys",
          is_deleted: false,
          title: "Ordinary keys",
          translated_description: "ordinary details",
          photo_path: "posts/lost-normal.jpg"
        }
      }
    });

    env.translateText
      .mockResolvedValueOnce("special key")
      .mockResolvedValueOnce("ordinary key holder ring");

    const { checkPotentialMatches } = require("../../lib/matcher/checkPotentialMatches");

    const result = await checkPotentialMatches(verifiedRequest({
      center_id: "uab",
      type: "found",
      category: "keys",
      title: "especial",
      description: "llavero"
    }));

    expect(env.translateText).toHaveBeenCalledWith("especial", "es");
    expect(env.translateText).toHaveBeenCalledWith("llavero", "es");

    expect(result.matches).toEqual([
      {
        id: "lost-special",
        title: "Special keychain",
        description: undefined,
        score: 1.1,
        photo_path: "posts/lost-special.jpg",
        postImageUrl: ""
      },
      {
        id: "lost-normal",
        title: "Ordinary keys",
        description: undefined,
        score: 0.85,
        photo_path: "posts/lost-normal.jpg",
        postImageUrl: ""
      }
    ]);
  });

  test("excludes candidates created by the current user", async () => {
    const env = setupCallableTestEnv({
      onceByPath: {
        "active_posts/uab/lost": {
          "lost-1": 100,
          "lost-own": 101
        },
        "posts/lost-1": {
          id: "lost-1",
          type: "lost",
          category: "keys",
          is_deleted: false,
          user_id: "other-user",
          title: "Llaves",
          translated_title: "keys",
          translated_description: "keys",
          photo_path: "posts/lost-1.jpg"
        },
        "posts/lost-own": {
          id: "lost-own",
          type: "lost",
          category: "keys",
          is_deleted: false,
          user_id: "user-1",
          title: "Mis llaves",
          translated_title: "keys",
          translated_description: "keys",
          photo_path: "posts/lost-own.jpg"
        }
      },
      translateResult: "keys"
    });
    const { checkPotentialMatches } = require("../../lib/matcher/checkPotentialMatches");

    const result = await checkPotentialMatches(verifiedRequest({
      center_id: "uab",
      type: "found",
      category: "keys",
      title: "keys",
      description: "keys"
    }));

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].id).toBe("lost-1");
  });

  test("allows candidates from different categories and awards category bonus", async () => {
    const env = setupCallableTestEnv({
      onceByPath: {
        "active_posts/uab/lost": {
          "lost-same-cat": 100,
          "lost-diff-cat": 101
        },
        "posts/lost-same-cat": {
          id: "lost-same-cat",
          type: "lost",
          category: "keys",
          is_deleted: false,
          user_id: "other-user",
          title: "Llaves rojas",
          translated_title: "red keychain",
          translated_description: "red keychain",
          photo_path: "posts/lost-same.jpg"
        },
        "posts/lost-diff-cat": {
          id: "lost-diff-cat",
          type: "lost",
          category: "accessories",
          is_deleted: false,
          user_id: "other-user",
          title: "Llavero rojo",
          translated_title: "red keychain",
          translated_description: "red keychain",
          photo_path: "posts/lost-diff.jpg"
        }
      },
      translateResult: "red keychain"
    });
    const { checkPotentialMatches } = require("../../lib/matcher/checkPotentialMatches");

    const result = await checkPotentialMatches(verifiedRequest({
      center_id: "uab",
      type: "found",
      category: "keys",
      title: "rojo",
      description: "rojo"
    }));

    expect(result.matches).toHaveLength(2);
    expect(result.matches[0].id).toBe("lost-same-cat");
    expect(result.matches[1].id).toBe("lost-diff-cat");
    expect(result.matches[0].score).toBeGreaterThan(result.matches[1].score);
  });

  test("tolerates typos (fuzzy matching) and removes diacritics and punctuation", async () => {
    const env = setupCallableTestEnv({
      onceByPath: {
        "active_posts/uab/lost": {
          "lost-fuzzy": 100
        },
        "posts/lost-fuzzy": {
          id: "lost-fuzzy",
          type: "lost",
          category: "bags",
          is_deleted: false,
          user_id: "other-user",
          title: "Mochila escolar",
          translated_description: "una mochila azul",
          photo_path: "posts/lost-fuzzy.jpg"
        }
      }
    });

    env.translateText
      .mockResolvedValueOnce("mochial") // typo in title
      .mockResolvedValueOnce("azul!"); // punctuation in description

    const { checkPotentialMatches } = require("../../lib/matcher/checkPotentialMatches");

    const result = await checkPotentialMatches(verifiedRequest({
      center_id: "uab",
      type: "found",
      category: "bags",
      title: "Móchial", // accent and typo
      description: "azul!" // punctuation
    }));

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].id).toBe("lost-fuzzy");
    // "mochial" matches "mochila escolar" via areWordsSimilar because getLevenshteinDistance("mochial", "mochila") is 2.
    // "azul!" matches "una mochila azul" via areWordsSimilar after punctuation removal.
    expect(result.matches[0].score).toBeGreaterThanOrEqual(1.0);
  });
});
