# gas-dev-release

## Release tool for gas-\* Google Apps Script libraries: publishes the build to dist branches with tags.

> [!CAUTION]
> Deprecated: folded into [gasdev](https://github.com/yorsh-co/gasdev) as `gasdev release`. See [Migrating to 3.0](https://github.com/yorsh-co/gasdev#migrating-to-30). This repository is archived.

> [!NOTE]
> `gas-dev-release` is development tooling. It is installed as a dev dependency and is never pushed to Apps Script.

> [!TIP]
> One of three gas-dev-\* tools. See [how they fit together](https://github.com/yorsh-co/gas-dev-config#gas-dev-tools) in gas-dev-config's README.

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
- Preflight checks before anything is touched: clean working tree, `vX.Y.Z` at `HEAD`, peer declarations' `@version` matching `package.json`, build present, release tags absent locally and on the remote
- Never ships `*.types.js` (by default) and removes stale or hidden files already on the release branch
- Generates a trimmed `package.json` for the release branch
- `--dry-run` shows the staged diff per target and restores the worktrees; `--target` releases a subset
- Strict configuration validation: unknown keys fail with the offending key path
- Plain ESM JavaScript, no build step and no runtime dependencies

## Requirements

- Node.js ^22.13.0, ^24.0.0 or >=26.0.0
- git >= 2.x with `git worktree` support
- A git-flow-style version tag `vX.Y.Z` (matching `version` in `package.json`) pointing at `HEAD`
- The build output (default `dist/`) already built, containing at least one `.js` file
- A remote (default `origin`) that receives the release branches and tags
- [GitHub CLI](https://cli.github.com) (`gh`), only when `githubRelease` is on

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

Exit codes: `0` on success, `1` when the release is refused or fails, `2` on invalid usage (an unknown option or a positional argument), `3` when the release was pushed but the GitHub Release failed (see [Failure recovery](#failure-recovery)).

```bash
npm run release -- --dry-run               # preview every target
npm run release -- --target dist-web       # release one branch of a multi-target project
npm run release -- --dry-run --target dist
npm run release                            # release
```

### What a release does

Run it from the released commit, after `git flow release finish` and the build:

1. **Preflight**, before anything is modified: the working tree is clean (the tool's own `.worktrees/` is ignored), `vX.Y.Z` exists and points at `HEAD`, the `@version` header of `peer/<name>.peer.types.d.ts` (when that file exists) equals `package.json`'s `version`, every target's build directory contains a `.js` file, every `files` and `include` source exists, and `<branch>/vX.Y.Z` exists neither locally nor on the remote. With `githubRelease` on, it also requires a GitHub remote, `vX.Y.Z` on the remote at the same commit, and a working authenticated `gh`. It also requires rulesets that protect every target branch (`deletion`, `non_fast_forward`) and all tags (`deletion`, `non_fast_forward`, `update` on `~ALL`). Bump the `@version` header in the release branch together with the version, because the check runs on the tagged commit.
2. **Sync**: for each target, fetches `<remote>/<branch>` if it exists and prepares a worktree at `.worktrees/<branch>` (reusing it, checking out the local branch, tracking the remote branch, or creating an orphan branch for a first release). The local branch is fast-forwarded to the remote; if it has commits the remote lacks, the release is refused.
3. **Stage**: clears the worktree, copies the build minus `exclude` and `hide`, the `include` trees, the `files` and the generated `package.json`, then runs `git add -A`.
4. **Guard**: fails with "Nothing to release" when no target has staged changes. Targets without changes are skipped and get no tag.
5. **Commit and tag** each changed target: commit `merge: vX.Y.Z`, tag `<branch>/vX.Y.Z`.
6. **Push** all changed branches and tags once, atomically (`git push --atomic`).
7. **GitHub Release** (opt-in, `githubRelease`): creates a GitHub Release for `vX.Y.Z` after the push, unless one (or a draft) already exists.

### Tags

| Tag               | Created by        | Points at                        |
| ----------------- | ----------------- | -------------------------------- |
| `vX.Y.Z`          | git-flow          | the released commit on `main`    |
| `<branch>/vX.Y.Z` | `gas-dev-release` | the release commit on `<branch>` |

For the default target the release tag is `dist/vX.Y.Z`.

### Dry run

`--dry-run` performs the preflight, the sync and the staging exactly as a real run, prints `git diff --cached --stat` for each changed target (or the "No changes — skipped" notice), and then restores each worktree: `git reset --hard` and `git clean -fdx` for an existing branch; for a first release, the empty worktree is removed and no local branch is left behind.

A dry run never commits, tags or pushes. Like a real run it fetches the remote branch and fast-forwards the local release branch to it, so those local ref updates remain. It exits `1` with "Nothing to release" in the same situations as a real run, so CI can detect it.

With `githubRelease` on, the dry run also reports the GitHub Release outcome: would be created, already exists (skipped), or a draft exists (skipped).

The dry run also refuses repositories whose rulesets do not protect the target branches and tags.

## Configuration

Configuration is optional and lives under a `gasDevRelease` key in your `package.json`. Without it, a single `dist` target with the defaults below is used.

```jsonc
"gasDevRelease": {
  "remote": "origin",
  "targets": [ { "branch": "dist" } ]
}
```

| Key             | Default                  | Description                                                                                                     |
| --------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `remote`        | `"origin"`               | Remote that receives the branches and tags                                                                      |
| `targets`       | `[{ "branch": "dist" }]` | Non-empty list of release targets; branches must be unique                                                      |
| `githubRelease` | `false`                  | After the push, create a GitHub Release for `vX.Y.Z` (requires `gh`, authenticated, and `vX.Y.Z` on the remote) |

### GitHub Release

The tool does not push `vX.Y.Z`; push it yourself (`git push <remote> vX.Y.Z`) before releasing. The remote must be a `github.com` repository; an SSH host alias for github.com (such as `github:owner/repo.git` with a `Host github` entry in `~/.ssh/config`) is resolved with `ssh -G`.

- **Notes**: the `## [X.Y.Z]` section of `CHANGELOG.md` (`[vX.Y.Z]` is also accepted). If there is none, the tag annotation is used, and otherwise the title `vX.Y.Z`.
- **Auth**: `gh auth login` locally, or `GH_TOKEN`/`GITHUB_TOKEN` in CI.
- **Existing releases**: if a Release for `vX.Y.Z` exists, it is left untouched. A draft counts as existing, so publish or delete it yourself.
- **Rulesets**: every target branch needs `deletion` and `non_fast_forward`, and an active tag ruleset on `~ALL` (no exclusions) needs `deletion`, `non_fast_forward` and `update`. Organization rulesets count. Run `npx gas-dev-config github --fix` (needs admin rights) to apply them.

### Target fields

Each target is merged over these defaults. Paths are relative to the project root unless noted.

| Field         | Default                                       | Description                                                                                              |
| ------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `branch`      | required                                      | Release branch; also the tag prefix (`<branch>/vX.Y.Z`)                                                  |
| `from`        | `"dist"`                                      | Build directory copied to the branch root                                                                |
| `hide`        | `["*.types.js"]`                              | Globs of files that are never shipped; removed if already on the branch                                  |
| `exclude`     | `[]`                                          | Globs of `from` subpaths skipped entirely, e.g. `"web/"`                                                 |
| `include`     | `[]`                                          | Extra build trees: `{ "from", "to", "hide" }`, copied from `from` to `to` (relative to the branch root)  |
| `files`       | `["README.md", "LICENSE.md", "CHANGELOG.md"]` | Project files copied into the branch; `"src:dest"` renames. Replaces the default list                    |
| `packageJson` | `true`                                        | Write the trimmed `package.json` (name, version, description, license, author, repository, `gasLibrary`) |

Unknown keys in `gasDevRelease`, in a target or in an `include` entry are rejected, naming the key path (for example `gasDevRelease.targets[1].pakageJson is not a known option`).

### Library metadata

Libraries declare their load order, and optionally their peer libraries, in the `gasDevConfig` key of `package.json`, which `gas-dev-config check` validates:

```jsonc
"gasDevConfig": {
  "loadOrder": ["gas-sheetdb.types.ts", "gas-sheetdb.errors.ts", "internal/x.ts"],
  "peers": { "gas-lock": "^1.1.0" }
}
```

When `loadOrder` is set, every target with `packageJson: true` gets a `gasLibrary` block after the other fields of its release `package.json`:

```jsonc
"gasLibrary": {
  "loadOrder": ["gas-sheetdb.errors.js", "internal/x.js"],
  "peers": { "gas-lock": "^1.1.0" }
}
```

- Each `x.ts` entry becomes `x.js`, relative to the target's `from` directory.
- Entries the target does not ship (matched by `hide` or `exclude`, including through an excluded directory) are dropped, which is why `gas-sheetdb.types.js` is absent above.
- A built `.js` file that does not exist is a preflight error; so is a load order where every entry is dropped.
- `peers` is copied as is and omitted when not configured. Without `loadOrder`, no `gasLibrary` block is written.
- A dry run lists the shipped files per target.

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

If `githubRelease` is on and the push succeeded but the GitHub Release could not be created, the tool exits `3`. The push is kept and nothing is rolled back. The notes are written to `.worktrees/github-release-vX.Y.Z.md`, and the error message prints the exact command to retry from the project root:

```bash
gh release create vX.Y.Z -R owner/repo --verify-tag --title vX.Y.Z --notes-file .worktrees/github-release-vX.Y.Z.md
```

Exit codes:

| Code | Meaning                                                                 |
| ---- | ----------------------------------------------------------------------- |
| `0`  | Released                                                                |
| `1`  | The release was refused or failed; nothing was pushed                   |
| `2`  | Invalid usage                                                           |
| `3`  | Released and pushed, but the GitHub Release was not created (see above) |

## Migrating from `scripts/release.sh`

1. Make GitHub the canonical remote: make sure GitHub has every branch and tag, then `git remote set-url origin git@github.com:yorsh-co/<name>.git`. Any other copy (e.g. a self-hosted Gitea) should pull-mirror GitHub rather than be pushed to.
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
