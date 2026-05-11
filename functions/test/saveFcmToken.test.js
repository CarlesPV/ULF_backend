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

describe("saveFcmToken", () => {
  test("stores the token under the authenticated user", async () => {
    const env = setupCallableTestEnv();
    const { saveFcmToken } = require("../lib/notifications/saveFcmToken");

    const result = await saveFcmToken(verifiedRequest({ token: "token-123" }));

    expect(result).toEqual({
      success: true,
      message: "Token registrado exitosamente."
    });
    expect(env.writes).toEqual([
      {
        op: "set",
        path: "users/user-1/fcm_tokens/token-123",
        value: true
      }
    ]);
  });

  test("rejects users without a verified email", async () => {
    setupCallableTestEnv();
    const { saveFcmToken } = require("../lib/notifications/saveFcmToken");

    await expect(saveFcmToken({
      auth: {
        uid: "user-1",
        token: { email_verified: false }
      },
      data: { token: "token-123" }
    })).rejects.toMatchObject({ code: "permission-denied" });
  });

  test("rejects missing tokens", async () => {
    setupCallableTestEnv();
    const { saveFcmToken } = require("../lib/notifications/saveFcmToken");

    await expect(saveFcmToken(verifiedRequest({})))
      .rejects.toMatchObject({ code: "invalid-argument" });
  });
});
