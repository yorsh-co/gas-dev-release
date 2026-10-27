# Changelog

---

## [Unreleased]

### Added

- Project scaffold: `gas-dev-release` CLI entry point with `--help` and `--version`
- Tooling: Prettier, ESLint (flat config), TypeScript `checkJs` type-checking, Vitest and Dependabot for npm
- Single-target release flow: publishes `dist/` to the `dist` branch and tags it `dist/v<version>`
  - Preflight: clean working tree, `v<version>` tag at `HEAD`, build directory with `.js` files, release tag absent locally and on the remote
  - Syncs the `.worktrees/dist` worktree (reuse, local branch, tracking the remote branch, or a new orphan branch) and fast-forwards it; refuses when the local branch has commits the remote lacks
  - Stages the build (without `*.types.js`), `README.md`, `LICENSE.md`, `CHANGELOG.md` and a trimmed `package.json`; fails when nothing changed
  - Commits `merge: v<version>`, tags and pushes the branch and tag atomically to `gasDevRelease.remote` (default `origin`)
