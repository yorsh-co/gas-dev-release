# Changelog

---

## [Unreleased]

### Changed

- Lint, TypeScript and Prettier configuration come from `gas-dev-config`
- Dependabot groups dev dependencies into one weekly PR

---

## [1.0.2] - 2026-10-27

### Fixed

- A repository moved on disk no longer breaks its release worktree: the worktree links are repaired (`git worktree repair`) before stale registrations are pruned
- A leftover `.worktrees/<branch>` that is not a valid worktree of the repository on that branch is reported with how to remove it, instead of as "local commits not on the remote"; other ancestry-check failures now surface git's error

---

## [1.0.1] - 2026-10-27

### Fixed

- A stale worktree registration (its directory was deleted or moved) no longer blocks a release; it is pruned before the release worktree is created

### Changed

- Package description and `--help` text match the README tagline

---

## [1.0.0] - 2026-10-27

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
- CLI options parsed with `node:util` `parseArgs` in strict mode: an unknown option or a positional argument prints `gas-dev-release: <message>` with a hint to run `--help` and exits 2
- `--target <branch>` (repeatable) releases only the named targets; preflight, sync and staging cover only the selected targets, and an unknown branch fails listing the configured branches
- `--dry-run` runs the preflight, worktree sync and staging of a real run, prints the staged diff stat per target (or the "No changes — skipped" notice), then restores the worktrees (`git reset --hard` and `git clean -fdx`; a first-release orphan worktree is removed, leaving no local branch). Nothing is committed, tagged or pushed; like a real run it fetches the remote branch and fast-forwards the local one, and it exits 1 on "Nothing to release"
- Strict config validation: unknown keys in `gasDevRelease`, in a target or in an `include` entry fail with the key path (e.g. `gasDevRelease.targets[1].pakageJson is not a known option`)
- README: features, requirements, install, usage, configuration reference with glob semantics, gas-webapp example, failure recovery, migration guide from `scripts/release.sh` and a Dependabot snippet

### Changed

- `targets: []` is rejected with `gasDevRelease.targets must be a non-empty array.`
