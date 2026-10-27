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
- Multi-target releases: `gasDevRelease.targets` lists the branches to publish, each merged over the defaults (`from`, `hide`, `exclude`, `include`, `files`, `packageJson`); `branch` is required and duplicate branches are rejected
  - `exclude`: globs of `from` subpaths that are skipped entirely; a trailing `/` (e.g. `web/`) matches directories only
  - `include`: extra `{ from, to, hide }` build trees copied into the branch; each `from` must exist
  - `files`: `"src:dest"` entries copy and rename project files (e.g. `src/web/README.md:README.md`); a missing source fails in preflight
  - `packageJson: false` skips the generated `package.json`
  - Targets without changes are skipped with a notice and get no commit or tag; the release fails only when no target changed
- Failed pushes report how to retry (`git push --atomic ...`) and how to discard the local commits and tags
- The clean-tree check ignores the tool's own `.worktrees/`, so projects that do not gitignore it still release
