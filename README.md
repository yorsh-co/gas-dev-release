# gas-dev-release

## Release tool for gas-\* Google Apps Script libraries: publishes the build to dist branches with v-prefixed tags.

> [!NOTE]
> `gas-dev-release` is development tooling. It is installed as a dev dependency and is never pushed to Apps Script.

> [!NOTE]
> `1.0.0` is the first release. It replaces the per-repo `scripts/release.sh` and `scripts/write-release-package-json.js` copies used by the `gas-*` libraries.

> **Disclaimer:**
> This project and [Yorsh](https://github.com/yorsh-co) are independent and are not affiliated with, endorsed by, or associated with Google LLC.

### Features

- Publishes a build directory (default `dist/`) to a release branch (default `dist`), so consumers can `git subtree` the compiled output without any TypeScript/ESLint tooling
- Zero configuration for single-target libraries; multi-target projects (e.g. a backend branch plus a web client branch) are configuration, not a fork
- Multi-target releases are all-or-nothing: every branch and tag is pushed in a single atomic `git push`
- Targets without changes are skipped with a notice and get no commit or tag
- Consistent `v`-prefixed tags: version tags `vX.Y.Z`, release tags `<branch>/vX.Y.Z`
- Preflight checks before anything is touched: clean working tree, `vX.Y.Z` at `HEAD`, build present, release tags absent locally and on the remote
- Never ships `*.types.js` (by default) and removes stale or hidden files already on the release branch
- Generates a trimmed `package.json` for the release branch
- `--dry-run` shows the staged diff per target and restores the worktrees; `--target` releases a subset
- Strict configuration validation: unknown keys fail with the offending key path
- Plain ESM JavaScript, no build step and no runtime dependencies

## Requirements

- Node.js >= 20.10
- git >= 2.x with `git worktree` support
- A git-flow-style version tag `vX.Y.Z` (matching `version` in `package.json`) pointing at `HEAD`
- The build output (default `dist/`) already built, containing at least one `.js` file
- A remote (default `origin`) that receives the release branches and tags

> [!IMPORTANT]
> The tool pushes to `gasDevRelease.remote` (default `origin`), which must be the canonical (GitHub) remote.

## Install

Add it to your library's `package.json` as a dev dependency, pinned to a release tag, with a `release` script:

```json
{
  "devDependencies": {
    "gas-dev-release": "github:yorsh-co/gas-dev-release#semver:^1.0.0"
  },
  "scripts": {
    "release": "gas-dev-release"
  }
}
```

The libraries chain the build and the release, so a release is always made from fresh output:

```json
{
  "scripts": {
    "build:release": "npm run build:format && npm run release"
  }
}
```

The version tag is created by git-flow. Configure it once per clone so `git flow release finish` creates `vX.Y.Z`:

```bash
git config gitflow.prefix.versiontag v
```

## Usage

```
gas-dev-release [--dry-run] [--target <branch>]...
```

| Option              | Description                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `--dry-run`         | Run all checks, stage the release and show the diff per target; commit, tag and push nothing |
| `--target <branch>` | Release only the given target. Repeatable; default: all configured targets                   |
| `-h`, `--help`      | Show usage                                                                                   |
| `--version`         | Show the version                                                                             |

Exit codes: `0` on success, `1` when the release is refused or fails, `2` on invalid usage (an unknown option or a positional argument).

```bash
npm run release -- --dry-run               # preview every target
npm run release -- --target dist-web       # release one branch of a multi-target project
npm run release -- --dry-run --target dist
npm run release                            # release
```

### What a release does

Run it from the released commit, after `git flow release finish` and the build:

1. **Preflight**, before anything is modified: the working tree is clean (the tool's own `.worktrees/` is ignored), `vX.Y.Z` exists and points at `HEAD`, every target's build directory contains a `.js` file, every `files` and `include` source exists, and `<branch>/vX.Y.Z` exists neither locally nor on the remote.
2. **Sync**: for each target, fetches `<remote>/<branch>` if it exists and prepares a worktree at `.worktrees/<branch>` (reusing it, checking out the local branch, tracking the remote branch, or creating an orphan branch for a first release). The local branch is fast-forwarded to the remote; if it has commits the remote lacks, the release is refused.
3. **Stage**: clears the worktree, copies the build minus `exclude` and `hide`, the `include` trees, the `files` and the generated `package.json`, then runs `git add -A`.
4. **Guard**: fails with "Nothing to release" when no target has staged changes. Targets without changes are skipped and get no tag.
5. **Commit and tag** each changed target: commit `merge: vX.Y.Z`, tag `<branch>/vX.Y.Z`.
6. **Push** all changed branches and tags once, atomically (`git push --atomic`).

### Tags

| Tag               | Created by        | Points at                        |
| ----------------- | ----------------- | -------------------------------- |
| `vX.Y.Z`          | git-flow          | the released commit on `main`    |
| `<branch>/vX.Y.Z` | `gas-dev-release` | the release commit on `<branch>` |

For the default target the release tag is `dist/vX.Y.Z`.

### Dry run

`--dry-run` performs the preflight, the sync and the staging exactly as a real run, prints `git diff --cached --stat` for each changed target (or the "No changes — skipped" notice), and then restores each worktree: `git reset --hard` and `git clean -fdx` for an existing branch; for a first release, the empty worktree is removed and no local branch is left behind.

A dry run never commits, tags or pushes. Like a real run it fetches the remote branch and fast-forwards the local release branch to it, so those local ref updates remain. It exits `1` with "Nothing to release" in the same situations as a real run, so CI can detect it.

## Configuration

Configuration is optional and lives under a `gasDevRelease` key in your `package.json`. Without it, a single `dist` target with the defaults below is used.

```jsonc
"gasDevRelease": {
  "remote": "origin",
  "targets": [ { "branch": "dist" } ]
}
```

| Key       | Default                  | Description                                                |
| --------- | ------------------------ | ---------------------------------------------------------- |
| `remote`  | `"origin"`               | Remote that receives the branches and tags                 |
| `targets` | `[{ "branch": "dist" }]` | Non-empty list of release targets; branches must be unique |

### Target fields

Each target is merged over these defaults. Paths are relative to the project root unless noted.

| Field         | Default                                       | Description                                                                                             |
| ------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `branch`      | required                                      | Release branch; also the tag prefix (`<branch>/vX.Y.Z`)                                                 |
| `from`        | `"dist"`                                      | Build directory copied to the branch root                                                               |
| `hide`        | `["*.types.js"]`                              | Globs of files that are never shipped; removed if already on the branch                                 |
| `exclude`     | `[]`                                          | Globs of `from` subpaths skipped entirely, e.g. `"web/"`                                                |
| `include`     | `[]`                                          | Extra build trees: `{ "from", "to", "hide" }`, copied from `from` to `to` (relative to the branch root) |
| `files`       | `["README.md", "LICENSE.md", "CHANGELOG.md"]` | Project files copied into the branch; `"src:dest"` renames. Replaces the default list                   |
| `packageJson` | `true`                                        | Write the trimmed `package.json` (name, version, description, license, author, repository)              |

Unknown keys in `gasDevRelease`, in a target or in an `include` entry are rejected, naming the key path (for example `gasDevRelease.targets[1].pakageJson is not a known option`).

### Glob semantics

`hide` and `exclude` patterns are gitignore-like and match `/`-separated paths relative to the copied directory:

- `*` matches any characters except `/`; `?` matches one character except `/`
- `**` matches any characters including `/`; `**/` also matches zero directories
- A pattern without `/` matches the file name at any depth (`*.types.js` matches `a/b/x.types.js`)
- A pattern with `/` is matched against the whole relative path (`shared/*.js`)
- A trailing `/` matches directories only (`web/` skips a `web` directory, not a file named `web`)

`hide` matches files only; `exclude` matches files and directories.

### Example: gas-webapp

A backend branch and a web client branch, released together:

```json
{
  "gasDevRelease": {
    "targets": [
      {
        "branch": "dist",
        "hide": ["**/types/*.js", "shared/*.js"],
        "exclude": ["web/"]
      },
      {
        "branch": "dist-web",
        "from": "dist/web",
        "hide": ["**/types/*.js"],
        "include": [
          { "from": "dist/shared", "to": "shared", "hide": ["*.js"] }
        ],
        "files": ["src/web/README.md:README.md", "LICENSE.md", "CHANGELOG.md"],
        "packageJson": false
      }
    ]
  }
}
```

This publishes `dist` (the backend, without `web/`) and `dist-web` (the client, plus the shared type declarations and its own README), tagged `dist/vX.Y.Z` and `dist-web/vX.Y.Z`.

## Failure recovery

Run `--dry-run` first; it surfaces most problems without touching any ref.

If the final push is rejected, nothing reached the remote, but the local release commits and tags are kept. The error message lists the commands, to run from the project root, to either:

- retry the push: `git push --atomic <remote> <branches and tags>`
- discard the local release: delete the tags with `git tag -d`, then reset each existing branch with `git -C .worktrees/<branch> reset --hard <remote>/<branch>`, or, for a branch that was never published, remove it with `git worktree remove --force .worktrees/<branch> && git branch -D <branch>`

Because the push is atomic, a multi-target release is never left half-published.

## Migrating from `scripts/release.sh`

1. Make GitHub the canonical remote: `git remote rename origin gitea`, `git remote add origin git@github.com:yorsh-co/<name>.git`, push all branches and tags, and set the upstreams to `origin`. Keep Gitea as a mirror of GitHub.
2. Use `v`-prefixed tags: replace plain tags (`X.Y.Z`, `dist/X.Y.Z`) with `vX.Y.Z` and `dist/vX.Y.Z`, and run `git config gitflow.prefix.versiontag v`.
3. Add the dev dependency and the `"release": "gas-dev-release"` script (see [Install](#install)). Add `gasDevRelease` only when the project is not a single `dist` target with the default settings.
4. Delete `scripts/release.sh` and `scripts/write-release-package-json.js`, and point `build:release` at `npm run release`.
5. Add `.worktrees/` to `.gitignore` if it is not already ignored (the clean-tree check tolerates it either way).
6. Build, then run `npm run release -- --dry-run` and compare the file list with what the old script published.
7. Run `npm run release`.

### Dependabot

Keep the dependency current with `.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
```

## License

MIT

See the `LICENSE` file for details.

## Support

Issues and feature requests are welcome via GitHub Issues.

Maintained by [yorsh-co](https://github.com/yorsh-co).

---

> [!TIP]
> Found `gas-dev-release` useful?
> Find more Google Apps Script libraries at [github.com/yorsh-co](https://github.com/yorsh-co).
