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
          score: 2,
          photo_path: "posts/lost-1.jpg"
        }
      ]
    });
    expect(env.refMock).toHaveBeenCalledWith("active_posts/uab");
    expect(env.refMock).toHaveBeenCalledWith("posts/lost-1");
    expect(env.translate).toHaveBeenCalledWith("azul cinta", "en");
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
});
