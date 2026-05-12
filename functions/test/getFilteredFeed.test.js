const { setupCallableTestEnv } = require("./helpers/callableTestEnv");

describe("getFilteredFeed search", () => {
    const posts = {
        "post-1": {
            id: "post-1",
            title: "Mochila roja",
            description: "Perdida en la biblioteca",
            translated_description: "lost in the library",
            center_id: "uab",
            type: "lost",
            status: "active",
            is_deleted: false,
            created_at: 1000
        },
        "post-2": {
            id: "post-2",
            title: "Gafas de sol",
            description: "Olvidadas en el bar",
            vision_labels: ["glasses", "accessory"],
            center_id: "uab",
            type: "lost",
            status: "active",
            is_deleted: false,
            created_at: 1100
        }
    };

    test("should find match in translated_description", async () => {
        const env = setupCallableTestEnv({
            translateResult: "library",
            onceByPath: {
                "active_posts/uab": { "post-1": 1000, "post-2": 1100 },
                "posts/post-1": posts["post-1"],
                "posts/post-2": posts["post-2"]
            }
        });

        const { getFilteredFeed } = require("../lib/feed/getFilteredFeed");

        const result = await getFilteredFeed({
            auth: { token: { email_verified: true } },
            data: { center_id: "uab", type: "lost", search_term: "biblioteca" }
        });

        expect(result.feed).toHaveLength(1);
        expect(result.feed[0].id).toBe("post-1");
    });

    test("should find match in original description if translation is missing", async () => {
        const env = setupCallableTestEnv({
            translateResult: "biblioteca",
            onceByPath: {
                "active_posts/uab": { "post-1": 1000 },
                "posts/post-1": { ...posts["post-1"], translated_description: undefined }
            }
        });

        const { getFilteredFeed } = require("../lib/feed/getFilteredFeed");

        const result = await getFilteredFeed({
            auth: { token: { email_verified: true } },
            data: { center_id: "uab", type: "lost", search_term: "biblioteca" }
        });

        expect(result.feed).toHaveLength(1);
        expect(result.feed[0].id).toBe("post-1");
    });

    test("should find match in vision_labels", async () => {
        const env = setupCallableTestEnv({
            translateResult: "glasses",
            onceByPath: {
                "active_posts/uab": { "post-1": 1000, "post-2": 1100 },
                "posts/post-1": posts["post-1"],
                "posts/post-2": posts["post-2"]
            }
        });

        const { getFilteredFeed } = require("../lib/feed/getFilteredFeed");

        const result = await getFilteredFeed({
            auth: { token: { email_verified: true } },
            data: { center_id: "uab", type: "lost", search_term: "glasses" }
        });

        expect(result.feed).toHaveLength(1);
        expect(result.feed[0].id).toBe("post-2");
    });

    test("should find match in title", async () => {
        const env = setupCallableTestEnv({
            translateResult: "gafas",
            onceByPath: {
                "active_posts/uab": { "post-1": 1000, "post-2": 1100 },
                "posts/post-1": posts["post-1"],
                "posts/post-2": posts["post-2"]
            }
        });

        const { getFilteredFeed } = require("../lib/feed/getFilteredFeed");

        const result = await getFilteredFeed({
            auth: { token: { email_verified: true } },
            data: { center_id: "uab", type: "lost", search_term: "gafas" }
        });

        expect(result.feed).toHaveLength(1);
        expect(result.feed[0].id).toBe("post-2");
    });
});
