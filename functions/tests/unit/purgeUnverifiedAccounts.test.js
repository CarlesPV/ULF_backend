const { setupCallableTestEnv } = require("./helpers/callableTestEnv");

function userRecord(uid, emailVerified, creationTime) {
    return {
        uid,
        emailVerified,
        metadata: {
            creationTime
        }
    };
}

describe("purgeUnverifiedAccounts scheduler", () => {
    test("deletes only unverified accounts older than 48 hours across pages", async () => {
        jest.spyOn(console, "log").mockImplementation(() => {});
        const now = Date.parse("2026-05-15T00:00:00.000Z");
        jest.spyOn(Date, "now").mockReturnValue(now);
        const env = setupCallableTestEnv({
            listUsersPages: [
                {
                    users: [
                        userRecord("expired-unverified", false, new Date(now - 49 * 60 * 60 * 1000).toISOString()),
                        userRecord("expired-verified", true, new Date(now - 72 * 60 * 60 * 1000).toISOString())
                    ],
                    pageToken: "page-2"
                },
                {
                    inputPageToken: "page-2",
                    users: [
                        userRecord("recent-unverified", false, new Date(now - 2 * 60 * 60 * 1000).toISOString())
                    ]
                }
            ]
        });
        const { purgeUnverifiedAccounts } = require("../../lib/maintenance/purgeUnverifiedAccounts");

        await purgeUnverifiedAccounts({});

        expect(env.authApi.listUsers).toHaveBeenCalledWith(1000, undefined);
        expect(env.authApi.listUsers).toHaveBeenCalledWith(1000, "page-2");
        expect(env.authApi.deleteUsers).toHaveBeenCalledTimes(1);
        expect(env.authApi.deleteUsers).toHaveBeenCalledWith(["expired-unverified"]);
        expect(env.writes).toEqual([
            {
                op: "update",
                path: "",
                value: {
                    "users/expired-unverified": null
                }
            }
        ]);
    });

    test("logs scheduler errors without throwing", async () => {
        const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        setupCallableTestEnv({
            listUsersRejects: new Error("auth failed")
        });
        const { purgeUnverifiedAccounts } = require("../../lib/maintenance/purgeUnverifiedAccounts");

        await expect(purgeUnverifiedAccounts({})).resolves.toBeUndefined();
        expect(errorSpy).toHaveBeenCalledWith("Error crítico purgado usuarios:", expect.any(Error));
    });
});
