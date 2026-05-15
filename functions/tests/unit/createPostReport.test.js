const { setupCallableTestEnv } = require("./helpers/callableTestEnv");

describe("createPostReport", () => {
    let env;

    beforeEach(() => {
        env = setupCallableTestEnv({
            onceByPath: {
                "centers/uab": {
                    id: "uab",
                    bounds: {
                        latMin: 41.48,
                        latMax: 41.52,
                        lngMin: 2.08,
                        lngMax: 2.13
                    }
                }
            }
        });
    });

    test("should reject users without a verified email", async () => {
        const { createPostReport } = require("../../lib/posts/createPostReport");

        await expect(createPostReport({
            auth: { uid: "user1", token: { email_verified: false } },
            data: {
                center_id: "uab",
                type: "found",
                title: "Objeto perdido",
                category: "others",
                lat: 41.50,
                lng: 2.10
            }
        })).rejects.toMatchObject({ code: "permission-denied" });
    });

    test("should reject incomplete report data", async () => {
        const { createPostReport } = require("../../lib/posts/createPostReport");

        await expect(createPostReport({
            auth: { uid: "user1", token: { email_verified: true } },
            data: {
                center_id: "uab",
                type: "found",
                category: "others",
                lat: 41.50,
                lng: 2.10
            }
        })).rejects.toMatchObject({ code: "invalid-argument" });
    });

    test("should reject unsupported categories", async () => {
        const { createPostReport } = require("../../lib/posts/createPostReport");

        await expect(createPostReport({
            auth: { uid: "user1", token: { email_verified: true } },
            data: {
                center_id: "uab",
                type: "found",
                title: "Objeto perdido",
                category: "not-valid",
                lat: 41.50,
                lng: 2.10
            }
        })).rejects.toMatchObject({ code: "invalid-argument" });
    });

    test("should reject reports for unknown centers", async () => {
        setupCallableTestEnv({
            onceByPath: {
                "centers/missing": null
            }
        });
        const { createPostReport } = require("../../lib/posts/createPostReport");

        await expect(createPostReport({
            auth: { uid: "user1", token: { email_verified: true } },
            data: {
                center_id: "missing",
                type: "found",
                title: "Objeto perdido",
                category: "others",
                lat: 41.50,
                lng: 2.10
            }
        })).rejects.toMatchObject({ code: "not-found" });
    });

    test("should throw out-of-range error if coordinates are outside center bounds", async () => {
        const { createPostReport } = require("../../lib/posts/createPostReport");
        
        const request = {
            auth: { uid: "user1", token: { email_verified: true } },
            data: {
                center_id: "uab",
                type: "found",
                title: "Objeto perdido",
                category: "others",
                lat: 40.0, // Muy lejos de UAB
                lng: 2.0
            }
        };

        try {
            await createPostReport(request);
            fail("Should have thrown an error");
        } catch (error) {
            expect(error.code).toBe("out-of-range");
            expect(error.message).toContain("fuera del campus");
        }
    });

    test("should succeed if coordinates are inside center bounds", async () => {
        const { createPostReport } = require("../../lib/posts/createPostReport");
        
        const request = {
            auth: { uid: "user1", token: { email_verified: true } },
            data: {
                center_id: "uab",
                type: "found",
                title: "Objeto perdido",
                category: "others",
                lat: 41.50, // Dentro de UAB
                lng: 2.10
            }
        };

        const result = await createPostReport(request);
        expect(result.success).toBe(true);
        expect(env.writes).toContainEqual(expect.objectContaining({
            op: "set",
            path: expect.stringContaining("posts/"),
            value: expect.objectContaining({
                id: "mock-key-1",
                user_id: "user1",
                center_id: "uab",
                title: "Objeto perdido",
                description: "",
                status: "active",
                coords: expect.objectContaining({
                    lat: 41.50,
                    lng: 2.10,
                    geohash: expect.any(String)
                }),
                photo_path: "",
                created_at: 1700000000000,
                updated_at: 1700000000000,
                is_deleted: false
            })
        }));
    });

    test("should allow centers without geographic bounds", async () => {
        const noBoundsEnv = setupCallableTestEnv({
            onceByPath: {
                "centers/uab": {
                    id: "uab"
                }
            }
        });
        const { createPostReport } = require("../../lib/posts/createPostReport");

        const result = await createPostReport({
            auth: { uid: "user1", token: { email_verified: true } },
            data: {
                center_id: "uab",
                type: "found",
                title: "Objeto sin bounds",
                description: "Cerca de la entrada",
                category: "others",
                lat: 10,
                lng: 20,
                photo_path: "posts/mock/image.jpg"
            }
        });

        expect(result).toEqual({ success: true, post_id: "mock-key-1" });
        expect(noBoundsEnv.writes[0]).toEqual(expect.objectContaining({
            op: "set",
            path: "posts/mock-key-1",
            value: expect.objectContaining({
                description: "Cerca de la entrada",
                photo_path: "posts/mock/image.jpg"
            })
        }));
    });
});
