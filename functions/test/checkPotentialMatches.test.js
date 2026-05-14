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
  test("reads active post ids and returns the highest scoring candidates", async () => {
    const env = setupCallableTestEnv({
      onceByPath: {
        "active_posts/uab": {
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
    const { checkPotentialMatches } = require("../lib/matcher/checkPotentialMatches");

    const result = await checkPotentialMatches(verifiedRequest({
      center_id: "uab",
      type: "found",
      category: "keys",
      color: "azul",
      description: "cinta"
    }));

    expect(result).toEqual({
      matches: [
        {
          id: "lost-1",
          title: "Llaves azules",
          description: undefined,
          score: 2,
          photo_path: "posts/lost-1.jpg",
          photo_url: ""
        }
      ]
    });
    expect(env.refMock).toHaveBeenCalledWith("active_posts/uab");
    expect(env.refMock).toHaveBeenCalledWith("posts/lost-1");
    expect(env.translateText).toHaveBeenCalledWith("azul cinta", "es");
  });

  test("returns an empty list when the active index has no entries", async () => {
    setupCallableTestEnv({
      onceByPath: {
        "active_posts/uab": null
      },
      translateResult: "blue"
    });
    const { checkPotentialMatches } = require("../lib/matcher/checkPotentialMatches");

    const result = await checkPotentialMatches(verifiedRequest({
      center_id: "uab",
      type: "found",
      category: "keys"
    }));

    expect(result).toEqual({ matches: [] });
  });

  test("returns a base score when only type and category match", async () => {
    const env = setupCallableTestEnv({
      onceByPath: {
        "active_posts/uab": {
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
    const { checkPotentialMatches } = require("../lib/matcher/checkPotentialMatches");

    const result = await checkPotentialMatches(verifiedRequest({
      center_id: "uab",
      type: "found",
      category: "keys"
    }));

    expect(result).toEqual({
      matches: [
        {
          id: "lost-1",
          title: "Llaves",
          description: "Sin detalles",
          score: 1,
          photo_path: "posts/lost-1.jpg",
          photo_url: ""
        }
      ]
    });
    expect(env.translateText).not.toHaveBeenCalled();
  });

  test("falls back to raw search terms when translation fails", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    setupCallableTestEnv({
      onceByPath: {
        "active_posts/uab": {
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
    const { checkPotentialMatches } = require("../lib/matcher/checkPotentialMatches");

    const result = await checkPotentialMatches(verifiedRequest({
      center_id: "uab",
      type: "found",
      category: "keys",
      color: "rojo"
    }));

    expect(result).toEqual({
      matches: [
        {
          id: "lost-1",
          title: "Llaves",
          description: "Llavero rojo intenso",
          score: 1.5,
          photo_path: "posts/lost-1.jpg",
          photo_url: ""
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
        translated_description: index === 6 ? "alpha beta gamma" : "alpha",
        photo_path: `posts/${id}.jpg`
      };
    }

    setupCallableTestEnv({
      onceByPath: {
        "active_posts/uab": activePosts,
        ...posts
      },
      translateResult: "alpha beta gamma"
    });
    const { checkPotentialMatches } = require("../lib/matcher/checkPotentialMatches");

    const result = await checkPotentialMatches(verifiedRequest({
      center_id: "uab",
      type: "found",
      category: "keys",
      description: "alpha beta gamma"
    }));

    expect(result.matches).toHaveLength(5);
    expect(result.matches[0]).toEqual({
      id: "lost-6",
      title: "Candidate 6",
      description: undefined,
      score: 2.5,
      photo_path: "posts/lost-6.jpg",
      photo_url: ""
    });
  });
});
