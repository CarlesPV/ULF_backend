module.exports = {
  clearMocks: true,
  resetMocks: false,
  restoreMocks: true,
  setupFilesAfterEnv: ["<rootDir>/tests/integration/helpers/jestSetup.js"],
  testEnvironment: "node",
  testMatch: ["<rootDir>/tests/integration/**/*.integration.test.js"],
  testTimeout: 60000
};
