# gas-dev-release

## Release tool for gas-\* Google Apps Script libraries: publishes the build to dist branches with v-prefixed tags.

> [!NOTE]
> `gas-dev-release` is development tooling. It is installed as a dev dependency and is never pushed to Apps Script.

> [!WARNING]
> Work in progress: the release logic is not implemented yet. The tool is not usable until `1.0.0`.

> **Disclaimer:**
> This project and [Yorsh](https://github.com/yorsh-co) are independent and are not affiliated with, endorsed by, or associated with Google LLC.

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

## Usage

```
gas-dev-release [--dry-run] [--target <branch>]...
```

- `--dry-run`: run all checks and show the staged changes per target, without committing, tagging or pushing
- `--target <branch>`: release only the given target (repeatable; default: all configured targets)
- `--help`, `-h`: show usage
- `--version`: show the version

## Configuration

Configuration is optional and lives under a `gasDevRelease` key in your `package.json`. Without it, a single `dist` target is used. The full reference will be documented before `1.0.0`.

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
