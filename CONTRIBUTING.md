# Contributing to Lipa-Cart-Backend

Thanks for working on Lipa-Cart. This document captures the rules and
expectations for code in this repository. They exist so the codebase stays
maintainable, secure, and scalable as the team and surface area grow.

## Ground rules

1. **Security and long-term stability come before convenience.** This is a
   fintech-adjacent app handling real customer money and PII. Shortcuts that
   compromise either of these are not acceptable, even if they unblock
   something short-term.
2. **Match the patterns already in the codebase.** When adding new code, read
   the nearest similar module first and follow its conventions (folder layout,
   naming, error handling, logging).
3. **Never commit secrets.** `.env`, `firebase-service-account.json`, and any
   other credential files are gitignored. If you need a new environment
   variable, add it to `.env.example` with a safe placeholder and document
   it.
4. **No direct pushes to `main`.** All changes go through a pull request with
   at least one reviewer.

## Before you commit

This repo uses Husky to run `lint-staged` on every commit. It will:

- Auto-fix ESLint issues on staged TypeScript/JavaScript files.
- Auto-format staged files with Prettier.

If you are cloning the repo for the first time, run `npm install` — the
`prepare` script will install the Husky hooks automatically.

You can also run the checks manually:

```bash
npm run check:types   # TypeScript type check
npm run lint          # ESLint (warn-only today)
npm run format:check  # Prettier check
npm run format        # Prettier write
npm run build         # Strapi build (sanity check)
```

## Pull request checklist

Before opening a PR, please verify:

- [ ] `npm run check:types` passes locally.
- [ ] `npm run build` succeeds locally.
- [ ] You have tested the change end-to-end against a local or staging env.
- [ ] You have not committed any `.env` values or credentials.
- [ ] The PR description explains **why** the change is being made, not just
      **what** changed.
- [ ] If the change touches data models, payments, auth, or external API
      contracts, you have flagged it in the PR description for extra review.
- [ ] If the change is a bug fix, a regression test exists (or the PR
      description explains why it doesn't).

## CI expectations

Every PR runs:

- **Typecheck + build** (`.github/workflows/ci.yml`) — must pass.
- **Lint** — currently in warn-only baseline mode. Do not introduce new
  warnings; fix any you see in files you touch.
- **Semgrep SAST** — findings surface as PR annotations. Treat high/critical
  findings as blockers unless there is a documented reason.
- **CodeQL** — same as Semgrep.
- **gitleaks** — blocks PRs that introduce secrets.
- **npm audit** — blocks PRs if high/critical vulns are introduced in
  production dependencies.

## Phase 2: when lint stops being warn-only

The lint CI job currently has `continue-on-error: true` so it does not block
PRs while the existing codebase is being cleaned up. Once the baseline is
clean, we will flip it to false. If you are fixing lint baseline debt as part
of a dedicated cleanup PR, say so in the PR title: `chore(lint): clean
baseline in <area>`.

## Reporting security issues

See [SECURITY.md](SECURITY.md). Do not open public GitHub issues for
vulnerabilities.

## Commit messages

Short, imperative, in present tense. Prefer conventional commit prefixes where
they add clarity (`fix:`, `feat:`, `chore:`, `refactor:`, `docs:`) but don't
force them if the existing history in the area doesn't use them. Explain the
**why** in the body if it isn't obvious from the diff.
