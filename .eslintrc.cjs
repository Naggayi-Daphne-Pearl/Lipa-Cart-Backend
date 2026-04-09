/**
 * ESLint config for Lipa-Cart-Backend (Strapi 5 + TypeScript).
 *
 * Phase 1 (current): minimal ruleset, warn-only in CI. The goal is to surface
 * problems without blocking PRs while the baseline is cleaned up.
 *
 * Phase 2 (later): tighten to errors, add stricter type-aware rules once the
 * existing codebase is clean. Flip `continue-on-error` in .github/workflows/ci.yml.
 */
module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  rules: {
    // Warn (not error) on unused vars; ignore leading-underscore convention.
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    // Strapi generated code uses `any` heavily; warn but don't fail.
    '@typescript-eslint/no-explicit-any': 'warn',
    // Console is useful in backend scripts and seeding.
    'no-console': 'off',
    // Strapi factories return untyped things; explicit returns hurt more than help here.
    '@typescript-eslint/explicit-module-boundary-types': 'off',
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    '.strapi/',
    '.tmp/',
    'coverage/',
    'public/',
    'types/generated/',
    '*.config.js',
    '*.config.cjs',
  ],
};
