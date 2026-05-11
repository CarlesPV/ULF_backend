const { queryKey, setupCallableTestEnv } = require("./helpers/callableTestEnv");

describe("secureUniversityRegistration", () => {
  test("creates an auth user and student profile for an allowed active domain", async () => {
    const env = setupCallableTestEnv({
      createUserResult: { uid: "uid-1" },
      onceByQuery: {
        [queryKey("centers", "email_domains/uab_cat", true)]: {
          uab: {
            id: "uab",
            is_active: true
          }
        }
      }
    });
    const { secureUniversityRegistration } = require("../lib/auth/secureUniversityRegistration");

    const result = await secureUniversityRegistration({
      data: {
        email: "student@uab.cat",
        password: "secret123",
        name: "Ada"
      }
    });

    expect(result).toEqual({ success: true, uid: "uid-1" });
    expect(env.authApi.createUser).toHaveBeenCalledWith({
      email: "student@uab.cat",
      password: "secret123",
      displayName: "Ada"
    });
    expect(env.writes).toEqual([
      {
        op: "set",
        path: "users/uid-1",
        value: expect.objectContaining({
          id: "uid-1",
          center_id: "uab",
          role: "student",
          email: "student@uab.cat",
          name: "Ada",
          created_at: 1700000000000,
          updated_at: 1700000000000,
          is_deleted: false
        })
      }
    ]);
  });

  test("rejects domains that are not registered in centers", async () => {
    const env = setupCallableTestEnv({
      onceByQuery: {
        [queryKey("centers", "email_domains/example_com", true)]: null
      }
    });
    const { secureUniversityRegistration } = require("../lib/auth/secureUniversityRegistration");

    await expect(secureUniversityRegistration({
      data: {
        email: "student@example.com",
        password: "secret123",
        name: "Ada"
      }
    })).rejects.toMatchObject({ code: "permission-denied" });

    expect(env.authApi.createUser).not.toHaveBeenCalled();
    expect(env.writes).toEqual([]);
  });

  test("maps duplicate auth emails to an already-exists error", async () => {
    const env = setupCallableTestEnv({
      createUserRejects: { code: "auth/email-already-exists" },
      onceByQuery: {
        [queryKey("centers", "email_domains/uab_cat", true)]: {
          uab: {
            id: "uab",
            is_active: true
          }
        }
      }
    });
    const { secureUniversityRegistration } = require("../lib/auth/secureUniversityRegistration");

    await expect(secureUniversityRegistration({
      data: {
        email: "student@uab.cat",
        password: "secret123",
        name: "Ada"
      }
    })).rejects.toMatchObject({ code: "already-exists" });

    expect(env.authApi.deleteUser).not.toHaveBeenCalled();
    expect(env.writes).toEqual([]);
  });
});
