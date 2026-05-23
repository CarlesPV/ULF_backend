module.exports = {
  clearMocks: true,
  resetMocks: false,
  restoreMocks: true,
  setupFilesAfterEnv: ["<rootDir>/tests/integration/helpers/jestSetup.js"],
  testEnvironment: "node",
  testPathIgnorePatterns: ["/node_modules/", "/\\._"],
  testMatch: ["<rootDir>/tests/integration/**/*.integration.test.js"],
  testTimeout: 60000
};
