/**
 * lint-staged runs on staged files before each commit (via Husky).
 * Keeps commits clean without requiring a full-repo lint run.
 *
 * jest --findRelatedTests runs the unit tests that depend on staged files.
 * Zero-cost when nothing tested changes — jest exits immediately thanks to
 * --passWithNoTests. --bail stops on first failure so the commit is blocked
 * before lint-staged finishes re-formatting files we no longer care about.
 */
module.exports = {
  '*.{ts,tsx,js,jsx}': [
    'eslint --fix',
    'prettier --write',
    'jest --findRelatedTests --passWithNoTests --bail',
  ],
  '*.{json,yml,yaml,md}': ['prettier --write'],
};
