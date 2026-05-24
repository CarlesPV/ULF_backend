const { setupCallableTestEnv, snapshot } = require("./helpers/callableTestEnv");

describe("cleanScheduledDeletions scheduled task", () => {
  let env;
  let fileMock;
  let bucketMock;
  let deletionsData;

  beforeEach(() => {
    jest.resetModules();
    env = setupCallableTestEnv();
    
    fileMock = {
      exists: jest.fn().mockResolvedValue([true]),
      delete: jest.fn().mockResolvedValue([])
    };
    bucketMock = {
      file: jest.fn(() => fileMock)
    };
    env.admin.storage = jest.fn(() => ({
      bucket: jest.fn(() => bucketMock)
    }));

    deletionsData = null;

    const originalRef = env.refMock.getMockImplementation();
    env.refMock.mockImplementation((path) => {
      if (path === "scheduled_deletions") {
        return {
          orderByChild: jest.fn(() => ({
            endAt: jest.fn(() => ({
              once: jest.fn(async () => snapshot(deletionsData))
            }))
          })),
          child: jest.fn((key) => ({
            remove: jest.fn(async () => {
              env.writes.push({ op: "remove", path: `scheduled_deletions/${key}` });
            })
          }))
        };
      }
      return originalRef(path);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("does nothing when there are no scheduled deletions", async () => {
    deletionsData = null;
    const { cleanScheduledDeletions } = require("../../lib/maintenance/cleanScheduledDeletions");

    await cleanScheduledDeletions({});

    expect(bucketMock.file).not.toHaveBeenCalled();
    expect(env.writes).toEqual([]);
  });

  test("processes expired scheduled deletions and deletes them from Storage and Database", async () => {
    deletionsData = {
      "deletion-1": { postId: "post-1", path: "posts/post-1/old.jpg", deleteAt: 1600000000 },
      "deletion-2": { postId: "post-2", path: "posts/post-2/thumb_old.jpg", deleteAt: 1650000000 }
    };

    const { cleanScheduledDeletions } = require("../../lib/maintenance/cleanScheduledDeletions");

    await cleanScheduledDeletions({});

    // Verify bucket.file was called for both paths
    expect(bucketMock.file).toHaveBeenCalledWith("posts/post-1/old.jpg");
    expect(bucketMock.file).toHaveBeenCalledWith("posts/post-2/thumb_old.jpg");

    // Verify both files were deleted
    expect(fileMock.delete).toHaveBeenCalledTimes(2);

    // Verify deletion records were removed from the Database
    expect(env.writes).toContainEqual({
      op: "remove",
      path: "scheduled_deletions/deletion-1"
    });
    expect(env.writes).toContainEqual({
      op: "remove",
      path: "scheduled_deletions/deletion-2"
    });
  });

  test("deletes Database record even if Storage file does not exist to avoid infinite loops", async () => {
    deletionsData = {
      "deletion-1": { postId: "post-1", path: "posts/post-1/notfound.jpg", deleteAt: 1600000000 }
    };

    // Mock file does not exist
    fileMock.exists = jest.fn().mockResolvedValue([false]);

    const { cleanScheduledDeletions } = require("../../lib/maintenance/cleanScheduledDeletions");

    await cleanScheduledDeletions({});

    expect(fileMock.delete).not.toHaveBeenCalled();
    expect(env.writes).toContainEqual({
      op: "remove",
      path: "scheduled_deletions/deletion-1"
    });
  });
});
