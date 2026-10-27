// @ts-check
import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(
  new URL('../../bin/gas-dev-release.js', import.meta.url),
);

/** @type {string[]} */
const sandboxes = [];

/**
 * Runs git and returns its trimmed stdout.
 *
 * @param {string} cwd
 * @param {...string} args
 * @returns {string}
 */
export function git(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/**
 * Writes files (path -> content) below a directory.
 *
 * @param {string} root
 * @param {Record<string, string>} files
 */
export function writeFiles(root, files) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
}

/**
 * @param {string} root
 * @param {string} name
 */
function configureUser(root, name = 'Test') {
  git(root, 'config', 'user.name', name);
  git(root, 'config', 'user.email', 'test@example.com');
}

/**
 * Creates a project repo with a bare `origin`, a built `dist/` and the `v1.0.0` tag.
 *
 * @returns {{ root: string, origin: string, sandbox: string }}
 */
export function createProject() {
  const sandbox = mkdtempSync(join(tmpdir(), 'gas-dev-release-'));
  sandboxes.push(sandbox);
  const origin = join(sandbox, 'origin.git');
  const root = join(sandbox, 'project');
  git(sandbox, 'init', '--bare', '-b', 'main', origin);
  mkdirSync(root);
  git(root, 'init', '-b', 'main');
  configureUser(root);
  git(root, 'remote', 'add', 'origin', origin);

  writeFiles(root, {
    '.gitignore': 'dist/\n.worktrees/\n',
    'README.md': '# lib\n',
    'LICENSE.md': 'MIT\n',
    'CHANGELOG.md': '# Changelog\n',
    'package.json': `${JSON.stringify(
      {
        name: 'gas-lib',
        version: '1.0.0',
        private: true,
        description: 'A library',
        license: 'MIT',
        author: 'Someone',
        repository: { type: 'git', url: 'https://example.com/gas-lib.git' },
        scripts: { build: 'tsc' },
        devDependencies: { typescript: '^5.0.0' },
      },
      null,
      2,
    )}\n`,
  });
  writeBuild(root, 'one');
  git(root, 'add', '-A');
  git(root, 'commit', '-m', 'feat: initial');
  git(root, 'tag', 'v1.0.0');
  git(root, 'push', 'origin', 'main', '--tags');
  return { root, origin, sandbox };
}

/**
 * Writes the (git-ignored) build output; `marker` changes the compiled content.
 *
 * @param {string} root
 * @param {string} marker
 */
export function writeBuild(root, marker) {
  writeFiles(root, {
    'dist/lib.js': `// ${marker}\n`,
    'dist/lib.d.ts': `// ${marker}\n`,
    'dist/lib.types.js': "'use strict';\n",
    'dist/lib.types.d.ts': `// ${marker}\n`,
  });
}

/**
 * Bumps the version in package.json, commits it and creates and pushes `v<version>`.
 *
 * @param {string} root
 * @param {string} version
 */
export function bumpVersion(root, version) {
  const path = join(root, 'package.json');
  const pkg = JSON.parse(readFileSync(path, 'utf8'));
  pkg.version = version;
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
  git(root, 'commit', '-am', `chore: release ${version}`);
  git(root, 'tag', `v${version}`);
  git(root, 'push', 'origin', 'main', '--tags');
}

/**
 * Clones the origin into a new project directory carrying over the build output.
 *
 * @param {{ root: string, origin: string, sandbox: string }} project
 * @returns {string} The clone's root.
 */
export function cloneProject({ root, origin, sandbox }) {
  const clone = join(sandbox, 'clone');
  git(sandbox, 'clone', origin, clone);
  configureUser(clone, 'Clone');
  cpSync(join(root, 'dist'), join(clone, 'dist'), { recursive: true });
  return clone;
}

/**
 * Runs the CLI in a project.
 *
 * @param {string} cwd
 * @param {string[]} [args]
 * @returns {import('node:child_process').SpawnSyncReturns<string>}
 */
export function runRelease(cwd, args = []) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: 'utf8',
  });
}

/** Removes every sandbox created by `createProject`. */
export function cleanup() {
  for (const sandbox of sandboxes.splice(0)) {
    rmSync(sandbox, { recursive: true, force: true });
  }
}
