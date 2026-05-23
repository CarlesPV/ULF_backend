module.exports = {
  clearMocks: true,
  resetMocks: false,
  restoreMocks: true,
  testEnvironment: "node",
  testPathIgnorePatterns: ["/node_modules/", "/\\._"],
  testMatch: ["<rootDir>/tests/unit/**/*.test.js"]
};
