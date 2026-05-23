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

    test("should reject users without a verified email", async () => {
        setupCallableTestEnv();
        const { getFilteredFeed } = require("../../lib/feed/getFilteredFeed");

        await expect(getFilteredFeed({
            auth: { token: { email_verified: false } },
            data: { center_id: "uab", type: "lost" }
        })).rejects.toMatchObject({ code: "permission-denied" });
    });

    test("should reject incomplete filter data", async () => {
        setupCallableTestEnv();
        const { getFilteredFeed } = require("../../lib/feed/getFilteredFeed");

        await expect(getFilteredFeed({
            auth: { token: { email_verified: true } },
            data: { type: "lost" }
        })).rejects.toMatchObject({ code: "invalid-argument" });
    });

    test("should return an empty feed when active index has no entries", async () => {
        setupCallableTestEnv({
            onceByPath: {
                "active_posts/uab/lost": null
            }
        });
        const { getFilteredFeed } = require("../../lib/feed/getFilteredFeed");

        const result = await getFilteredFeed({
            auth: { token: { email_verified: true } },
            data: { center_id: "uab", type: "lost" }
        });

        expect(result).toEqual({ feed: [] });
    });

    test("should filter by category, sort by date, and limit results", async () => {
        setupCallableTestEnv({
            onceByPath: {
                "active_posts/uab/lost": { "post-1": 1000, "post-2": 1100, "post-3": 1200 },
                "posts/post-1": { ...posts["post-1"], category: "bags", created_at: 1000 },
                "posts/post-2": { ...posts["post-2"], category: "accessories", created_at: 1100 },
                "posts/post-3": {
                    id: "post-3",
                    title: "Mochila azul",
                    center_id: "uab",
                    type: "lost",
                    category: "bags",
                    status: "active",
                    is_deleted: false,
                    created_at: 1200
                }
            }
        });
        const { getFilteredFeed } = require("../../lib/feed/getFilteredFeed");

        const result = await getFilteredFeed({
            auth: { token: { email_verified: true } },
            data: { center_id: "uab", type: "lost", category: "bags", max_results: 1 }
        });

        expect(result.feed.map((post) => post.id)).toEqual(["post-3"]);
    });

    test("should find match in translated_description", async () => {
        const env = setupCallableTestEnv({
            translateResult: "library",
            onceByPath: {
                "active_posts/uab/lost": { "post-1": 1000, "post-2": 1100 },
                "posts/post-1": posts["post-1"],
                "posts/post-2": posts["post-2"]
            }
        });

        const { getFilteredFeed } = require("../../lib/feed/getFilteredFeed");

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
                "active_posts/uab/lost": { "post-1": 1000 },
                "posts/post-1": { ...posts["post-1"], translated_description: undefined }
            }
        });

        const { getFilteredFeed } = require("../../lib/feed/getFilteredFeed");

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
                "active_posts/uab/lost": { "post-1": 1000, "post-2": 1100 },
                "posts/post-1": posts["post-1"],
                "posts/post-2": posts["post-2"]
            }
        });

        const { getFilteredFeed } = require("../../lib/feed/getFilteredFeed");

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
                "active_posts/uab/lost": { "post-1": 1000, "post-2": 1100 },
                "posts/post-1": posts["post-1"],
                "posts/post-2": posts["post-2"]
            }
        });

        const { getFilteredFeed } = require("../../lib/feed/getFilteredFeed");

        const result = await getFilteredFeed({
            auth: { token: { email_verified: true } },
            data: { center_id: "uab", type: "lost", search_term: "gafas" }
        });

        expect(result.feed).toHaveLength(1);
        expect(result.feed[0].id).toBe("post-2");
    });

    test("should fall back to raw search term when translation fails", async () => {
        jest.spyOn(console, "error").mockImplementation(() => {});
        setupCallableTestEnv({
            translateRejects: new Error("translate failed"),
            onceByPath: {
                "active_posts/uab/lost": { "post-1": 1000 },
                "posts/post-1": { ...posts["post-1"], translated_description: undefined }
            }
        });
        const { getFilteredFeed } = require("../../lib/feed/getFilteredFeed");

        const result = await getFilteredFeed({
            auth: { token: { email_verified: true } },
            data: { center_id: "uab", type: "lost", search_term: "biblioteca" }
        });

        expect(result.feed).toHaveLength(1);
        expect(result.feed[0].id).toBe("post-1");
    });

    test("should sort by distance and exclude posts without valid coordinates", async () => {
        setupCallableTestEnv({
            onceByPath: {
                "active_posts/uab/lost": { "near": 1000, "far": 1100, "no-coords": 1200 },
                "posts/near": {
                    id: "near",
                    center_id: "uab",
                    type: "lost",
                    status: "active",
                    is_deleted: false,
                    created_at: 1000,
                    coords: { lat: 41.5001, lng: 2.1001 }
                },
                "posts/far": {
                    id: "far",
                    center_id: "uab",
                    type: "lost",
                    status: "active",
                    is_deleted: false,
                    created_at: 1100,
                    coords: { lat: 41.52, lng: 2.13 }
                },
                "posts/no-coords": {
                    id: "no-coords",
                    center_id: "uab",
                    type: "lost",
                    status: "active",
                    is_deleted: false,
                    created_at: 1200
                }
            }
        });
        const { getFilteredFeed } = require("../../lib/feed/getFilteredFeed");

        const result = await getFilteredFeed({
            auth: { token: { email_verified: true } },
            data: {
                center_id: "uab",
                type: "lost",
                sort_by: "distance",
                user_lat: 41.5,
                user_lng: 2.1
            }
        });

        expect(result.feed.map((post) => post.id)).toEqual(["near", "far"]);
        expect(result.feed[0].distance_km).toBeLessThan(result.feed[1].distance_km);
    });

    test("should reject request with error_gps_required if sortBy is distance but latitude or longitude is missing", async () => {
        setupCallableTestEnv();
        const { getFilteredFeed } = require("../../lib/feed/getFilteredFeed");

        await expect(getFilteredFeed({
            auth: { token: { email_verified: true } },
            data: {
                center_id: "uab",
                type: "lost",
                sortBy: "distance"
            }
        })).rejects.toMatchObject({
            code: "invalid-argument",
            message: "error_gps_required"
        });
    });

    test("should sort by distance using calculateDistance when sortBy is distance and latitude/longitude are provided", async () => {
        setupCallableTestEnv({
            onceByPath: {
                "active_posts/uab/lost": { "near": 1000, "far": 1100, "no-coords": 1200 },
                "posts/near": {
                    id: "near",
                    center_id: "uab",
                    type: "lost",
                    status: "active",
                    is_deleted: false,
                    created_at: 1000,
                    coords: { lat: 41.5001, lng: 2.1001 }
                },
                "posts/far": {
                    id: "far",
                    center_id: "uab",
                    type: "lost",
                    status: "active",
                    is_deleted: false,
                    created_at: 1100,
                    coords: { lat: 41.52, lng: 2.13 }
                },
                "posts/no-coords": {
                    id: "no-coords",
                    center_id: "uab",
                    type: "lost",
                    status: "active",
                    is_deleted: false,
                    created_at: 1200
                }
            }
        });
        const { getFilteredFeed } = require("../../lib/feed/getFilteredFeed");

        const result = await getFilteredFeed({
            auth: { token: { email_verified: true } },
            data: {
                center_id: "uab",
                type: "lost",
                sortBy: "distance",
                latitude: 41.5,
                longitude: 2.1
            }
        });

        expect(result.feed.map((post) => post.id)).toEqual(["near", "far"]);
        expect(result.feed[0].distance).toBeDefined();
        expect(result.feed[1].distance).toBeDefined();
        expect(result.feed[0].distance).toBeLessThan(result.feed[1].distance);
    });

    test("should fetch and merge both lost and found posts when type is not specified", async () => {
        setupCallableTestEnv({
            onceByPath: {
                "active_posts/uab/lost": { "post-lost-1": 1000 },
                "active_posts/uab/found": { "post-found-1": 1100 },
                "posts/post-lost-1": {
                    id: "post-lost-1",
                    center_id: "uab",
                    type: "lost",
                    status: "active",
                    is_deleted: false,
                    created_at: 1000
                },
                "posts/post-found-1": {
                    id: "post-found-1",
                    center_id: "uab",
                    type: "found",
                    status: "active",
                    is_deleted: false,
                    created_at: 1100
                }
            }
        });
        const { getFilteredFeed } = require("../../lib/feed/getFilteredFeed");

        const result = await getFilteredFeed({
            auth: { token: { email_verified: true } },
            data: {
                center_id: "uab"
            }
        });

        expect(result.feed).toHaveLength(2);
        expect(result.feed[0].id).toBe("post-found-1");
        expect(result.feed[1].id).toBe("post-lost-1");
    });
});
