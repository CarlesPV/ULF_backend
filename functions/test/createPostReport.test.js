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

    test("should throw out-of-range error if coordinates are outside center bounds", async () => {
        const { createPostReport } = require("../lib/posts/createPostReport");
        
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
        const { createPostReport } = require("../lib/posts/createPostReport");
        
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
                center_id: "uab",
                title: "Objeto perdido"
            })
        }));
    });
});
