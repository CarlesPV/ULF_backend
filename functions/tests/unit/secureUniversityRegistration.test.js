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
    const { secureUniversityRegistration } = require("../../lib/auth/secureUniversityRegistration");

    const result = await secureUniversityRegistration({
      data: {
        email: "student@uab.cat",
        password: "secret123",
        name: "Ada",
        termsAccepted: true,
        privacyAccepted: true
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
          settings: {
            language: "es",
            pushNotificationsEnabled: true,
            push_notifications: true,
            dark_mode: false
          },
          legal: {
            termsAccepted: true,
            privacyAccepted: true,
            acceptedAt: 1700000000000
          },
          created_at: 1700000000000,
          updated_at: 1700000000000,
          is_deleted: false
        })
      }
    ]);
  });

  test("rejects incomplete registration data", async () => {
    setupCallableTestEnv();
    const { secureUniversityRegistration } = require("../../lib/auth/secureUniversityRegistration");

    await expect(secureUniversityRegistration({
      data: {
        email: "student@uab.cat",
        password: "secret123"
      }
    })).rejects.toMatchObject({ code: "invalid-argument" });
  });

  test("rejects emails without a domain", async () => {
    setupCallableTestEnv();
    const { secureUniversityRegistration } = require("../../lib/auth/secureUniversityRegistration");

    await expect(secureUniversityRegistration({
      data: {
        email: "student",
        password: "secret123",
        name: "Ada"
      }
    })).rejects.toMatchObject({ code: "invalid-argument" });
  });

  test("rejects domains that are not registered in centers", async () => {
    const env = setupCallableTestEnv({
      onceByQuery: {
        [queryKey("centers", "email_domains/example_com", true)]: null
      }
    });
    const { secureUniversityRegistration } = require("../../lib/auth/secureUniversityRegistration");

    await expect(secureUniversityRegistration({
      data: {
        email: "student@example.com",
        password: "secret123",
        name: "Ada",
        termsAccepted: true,
        privacyAccepted: true
      }
    })).rejects.toMatchObject({ code: "permission-denied" });

    expect(env.authApi.createUser).not.toHaveBeenCalled();
    expect(env.writes).toEqual([]);
  });

  test("rejects inactive centers", async () => {
    const env = setupCallableTestEnv({
      onceByQuery: {
        [queryKey("centers", "email_domains/uab_cat", true)]: {
          uab: {
            id: "uab",
            is_active: false
          }
        }
      }
    });
    const { secureUniversityRegistration } = require("../../lib/auth/secureUniversityRegistration");

    await expect(secureUniversityRegistration({
      data: {
        email: "student@uab.cat",
        password: "secret123",
        name: "Ada",
        termsAccepted: true,
        privacyAccepted: true
      }
    })).rejects.toMatchObject({ code: "unavailable" });

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
    const { secureUniversityRegistration } = require("../../lib/auth/secureUniversityRegistration");

    await expect(secureUniversityRegistration({
      data: {
        email: "student@uab.cat",
        password: "secret123",
        name: "Ada",
        termsAccepted: true,
        privacyAccepted: true
      }
    })).rejects.toMatchObject({ code: "already-exists" });

    expect(env.authApi.deleteUser).not.toHaveBeenCalled();
    expect(env.writes).toEqual([]);
  });

  test("rolls back the auth user when profile creation fails", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "log").mockImplementation(() => {});
    const env = setupCallableTestEnv({
      createUserResult: { uid: "uid-rollback" },
      onceByQuery: {
        [queryKey("centers", "email_domains/uab_cat", true)]: {
          uab: {
            id: "uab",
            is_active: true
          }
        }
      },
      setRejectsByPath: {
        "users/uid-rollback": new Error("write failed")
      }
    });
    const { secureUniversityRegistration } = require("../../lib/auth/secureUniversityRegistration");

    await expect(secureUniversityRegistration({
      data: {
        email: "student@uab.cat",
        password: "secret123",
        name: "Ada",
        language: "ca",
        termsAccepted: true,
        privacyAccepted: true
      }
    })).rejects.toMatchObject({ code: "internal" });

    expect(env.authApi.deleteUser).toHaveBeenCalledWith("uid-rollback");
  });

  test("uses the requested language in the created profile settings", async () => {
    const env = setupCallableTestEnv({
      createUserResult: { uid: "uid-ca" },
      onceByQuery: {
        [queryKey("centers", "email_domains/uab_cat", true)]: {
          uab: {
            id: "uab",
            is_active: true
          }
        }
      }
    });
    const { secureUniversityRegistration } = require("../../lib/auth/secureUniversityRegistration");

    await secureUniversityRegistration({
      data: {
        email: "student@uab.cat",
        password: "secret123",
        name: "Ada",
        language: "ca",
        termsAccepted: true,
        privacyAccepted: true
      }
    });

    expect(env.writes[0].value.settings.language).toBe("ca");
  });

  test("uses the preferredLanguage key in the created profile settings", async () => {
    const env = setupCallableTestEnv({
      createUserResult: { uid: "uid-en" },
      onceByQuery: {
        [queryKey("centers", "email_domains/uab_cat", true)]: {
          uab: {
            id: "uab",
            is_active: true
          }
        }
      }
    });
    const { secureUniversityRegistration } = require("../../lib/auth/secureUniversityRegistration");

    await secureUniversityRegistration({
      data: {
        email: "student@uab.cat",
        password: "secret123",
        name: "Ada",
        preferredLanguage: "en",
        termsAccepted: true,
        privacyAccepted: true
      }
    });

    expect(env.writes[0].value.settings.language).toBe("en");
  });

  test("rejects an unsupported language", async () => {
    setupCallableTestEnv({
      onceByQuery: {
        [queryKey("centers", "email_domains/uab_cat", true)]: {
          uab: {
            id: "uab",
            is_active: true
          }
        }
      }
    });
    const { secureUniversityRegistration } = require("../../lib/auth/secureUniversityRegistration");

    await expect(secureUniversityRegistration({
      data: {
        email: "student@uab.cat",
        password: "secret123",
        name: "Ada",
        preferredLanguage: "fr",
        termsAccepted: true,
        privacyAccepted: true
      }
    })).rejects.toMatchObject({ code: "invalid-argument" });
  });

  test("uses default language 'es' if preferredLanguage is empty", async () => {
    const env = setupCallableTestEnv({
      createUserResult: { uid: "uid-default" },
      onceByQuery: {
        [queryKey("centers", "email_domains/uab_cat", true)]: {
          uab: {
            id: "uab",
            is_active: true
          }
        }
      }
    });
    const { secureUniversityRegistration } = require("../../lib/auth/secureUniversityRegistration");

    await secureUniversityRegistration({
      data: {
        email: "student@uab.cat",
        password: "secret123",
        name: "Ada",
        preferredLanguage: "",
        termsAccepted: true,
        privacyAccepted: true
      }
    });

    expect(env.writes[0].value.settings.language).toBe("es");
  });

  test("rejects when terms and privacy acceptance is missing", async () => {
    setupCallableTestEnv();
    const { secureUniversityRegistration } = require("../../lib/auth/secureUniversityRegistration");

    await expect(secureUniversityRegistration({
      data: {
        email: "student@uab.cat",
        password: "secret123",
        name: "Ada"
      }
    })).rejects.toMatchObject({
      code: "invalid-argument",
      message: "error_legal_acceptance_required"
    });
  });

  test("sets acceptedTermsVersion to '1.0.0' by default if terms_version is not set in DB", async () => {
    const env = setupCallableTestEnv({
      createUserResult: { uid: "uid-terms-null" },
      onceByQuery: {
        [queryKey("centers", "email_domains/uab_cat", true)]: {
          uab: {
            id: "uab",
            is_active: true
          }
        }
      }
    });
    const { secureUniversityRegistration } = require("../../lib/auth/secureUniversityRegistration");

    await secureUniversityRegistration({
      data: {
        email: "student@uab.cat",
        password: "secret123",
        name: "Ada",
        termsAccepted: true,
        privacyAccepted: true
      }
    });

    expect(env.writes[0].value.acceptedTermsVersion).toBe("1.0.0");
  });

  test("saves acceptedTermsVersion from settings/legal/terms_version when present in DB", async () => {
    const env = setupCallableTestEnv({
      createUserResult: { uid: "uid-terms-provided" },
      onceByQuery: {
        [queryKey("centers", "email_domains/uab_cat", true)]: {
          uab: {
            id: "uab",
            is_active: true
          }
        }
      },
      onceByPath: {
        "settings/legal/terms_version": "2.1.3"
      }
    });
    const { secureUniversityRegistration } = require("../../lib/auth/secureUniversityRegistration");

    await secureUniversityRegistration({
      data: {
        email: "student@uab.cat",
        password: "secret123",
        name: "Ada",
        termsAccepted: true,
        privacyAccepted: true
      }
    });

    expect(env.writes[0].value.acceptedTermsVersion).toBe("2.1.3");
  });
});
