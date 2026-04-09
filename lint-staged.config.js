/**
 * lint-staged runs on staged files before each commit (via Husky).
 * Keeps commits clean without requiring a full-repo lint run.
 */
module.exports = {
  '*.{ts,tsx,js,jsx}': ['eslint --fix', 'prettier --write'],
  '*.{json,yml,yaml,md}': ['prettier --write'],
};
