/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  // These unit tests only exercise pure helpers — no Strapi boot, no DB.
  // Integration/E2E tests (see .claude/standards/e2e_test_strategy.md) will
  // live alongside this and use setupStrapi/cleanupStrapi from tests/.
};
