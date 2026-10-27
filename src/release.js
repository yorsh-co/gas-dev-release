// @ts-check
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { loadConfig } from './config.js';
import { ReleaseError } from './errors.js';
import { git, gitSucceeds } from './git.js';
import { matchesAny } from './glob.js';
import { releasePackageJson } from './package-json.js';

/** @typedef {import('./config.js').ReleaseConfig} ReleaseConfig */
/** @typedef {import('./config.js').Target} Target */

/**
 * @typedef {object} PreparedTarget
 * @property {Target} target
 * @property {string} worktree Absolute path of the target's worktree.
 * @property {string} tag Release tag, `<branch>/v<version>`.
 */

/**
 * Releases the project: publishes each target's build to its branch and tags it.
 *
 * @param {string} cwd Project root.
 * @param {(message: string) => void} [log] Progress output.
 * @returns {void}
 * @throws {ReleaseError} On an expected failure; nothing is pushed.
 */
export function release(cwd, log = () => {}) {
  const config = loadConfig(cwd);

  log('Running preflight checks...');
  preflight(config, cwd);

  const prepared = config.targets.map((target) => {
    log(`[${target.branch}] Checking out release worktree...`);
    const worktree = syncWorktree(config, target, cwd);
    log(`[${target.branch}] Syncing release contents...`);
    stage(config, target, cwd, worktree);
    return {
      target,
      worktree,
      tag: releaseTag(target, config.version),
    };
  });

  const changed = prepared.filter(({ worktree }) => hasStagedChanges(worktree));
  if (changed.length === 0) {
    const branches = prepared.map(({ target }) => target.branch).join(', ');
    throw new ReleaseError(
      `Nothing to release — ${branches} already matches the build.`,
    );
  }

  log('Committing and tagging...');
  for (const { worktree, tag } of changed) {
    git(['commit', '-m', `merge: v${config.version}`], worktree);
    git(['tag', tag], worktree);
  }

  log(`Pushing to ${config.remote}...`);
  push(config, changed, cwd);
}

/**
 * @param {Target} target
 * @param {string} version
 * @returns {string}
 */
function releaseTag(target, version) {
  return `${target.branch}/v${version}`;
}

/**
 * Verifies every precondition before anything is modified.
 *
 * @param {ReleaseConfig} config
 * @param {string} cwd
 * @returns {void}
 * @throws {ReleaseError}
 */
function preflight(config, cwd) {
  const { version, remote, targets } = config;

  if (git(['status', '--porcelain'], cwd) !== '') {
    throw new ReleaseError(
      'Working tree is not clean — commit or stash your changes first.',
    );
  }

  const versionTag = `v${version}`;
  const tagCommit = gitSucceeds(
    ['rev-parse', '--verify', '--quiet', `refs/tags/${versionTag}`],
    cwd,
  )
    ? git(['rev-parse', `refs/tags/${versionTag}^{commit}`], cwd)
    : null;
  if (tagCommit === null) {
    throw new ReleaseError(
      `Version tag ${versionTag} does not exist — finish the git-flow release first.`,
    );
  }
  if (tagCommit !== git(['rev-parse', 'HEAD'], cwd)) {
    throw new ReleaseError(
      `Version tag ${versionTag} does not point at HEAD — check out ${versionTag} (the released commit), or finish the git-flow release first.`,
    );
  }

  for (const target of targets) {
    if (!hasJsFile(join(cwd, target.from))) {
      throw new ReleaseError(
        `${target.from}/ is missing or has no .js files — run the build first.`,
      );
    }
    const tag = releaseTag(target, version);
    if (
      gitSucceeds(['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`], cwd)
    ) {
      throw new ReleaseError(
        `Tag ${tag} already exists locally — bump the version in package.json.`,
      );
    }
    if (remoteHas(remote, 'tags', tag, cwd)) {
      throw new ReleaseError(
        `Tag ${tag} already exists on ${remote} — bump the version in package.json.`,
      );
    }
  }
}

/**
 * @param {string} remote
 * @param {'heads' | 'tags'} kind
 * @param {string} name
 * @param {string} cwd
 * @returns {boolean}
 * @throws {ReleaseError} When the remote cannot be queried.
 */
function remoteHas(remote, kind, name, cwd) {
  try {
    return (
      git(['ls-remote', `--${kind}`, remote, `refs/${kind}/${name}`], cwd) !==
      ''
    );
  } catch (error) {
    throw new ReleaseError(
      `Cannot query remote "${remote}": ${/** @type {Error} */ (error).message}`,
    );
  }
}

/**
 * @param {string} dir
 * @returns {boolean} Whether the directory contains a `.js` file at any depth.
 */
function hasJsFile(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return false;
  return readdirSync(dir, { withFileTypes: true }).some((entry) =>
    entry.isDirectory()
      ? hasJsFile(join(dir, entry.name))
      : entry.name.endsWith('.js'),
  );
}

/**
 * Prepares the target's worktree and fast-forwards it to the remote branch.
 *
 * @param {ReleaseConfig} config
 * @param {Target} target
 * @param {string} cwd
 * @returns {string} Absolute worktree path.
 * @throws {ReleaseError} When the local branch has commits the remote lacks.
 */
function syncWorktree(config, target, cwd) {
  const { remote } = config;
  const { branch } = target;
  const relative = join('.worktrees', branch);
  const worktree = join(cwd, relative);
  const remoteRef = `${remote}/${branch}`;

  const hasRemote = remoteHas(remote, 'heads', branch, cwd);
  if (hasRemote) {
    git(
      ['fetch', '--no-prune', remote, `${branch}:refs/remotes/${remoteRef}`],
      cwd,
    );
  }

  if (existsSync(worktree)) {
    // Reuse the existing worktree.
  } else if (
    gitSucceeds(
      ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`],
      cwd,
    )
  ) {
    git(['worktree', 'add', relative, branch], cwd);
  } else if (hasRemote) {
    git(['worktree', 'add', '--track', '-b', branch, relative, remoteRef], cwd);
  } else {
    git(['worktree', 'add', '--detach', relative], cwd);
    git(['checkout', '--orphan', branch], worktree);
    gitSucceeds(['rm', '-rf', '.'], worktree);
  }

  if (hasRemote) {
    if (
      !gitSucceeds(['merge-base', '--is-ancestor', 'HEAD', remoteRef], worktree)
    ) {
      throw new ReleaseError(
        `Local ${branch} has commits that are not on ${remoteRef} — resolve before releasing.`,
      );
    }
    git(['merge', '--ff-only', remoteRef], worktree);
  }
  return worktree;
}

/**
 * Replaces the worktree contents with the target's release files and stages them.
 *
 * @param {ReleaseConfig} config
 * @param {Target} target
 * @param {string} cwd
 * @param {string} worktree
 * @returns {void}
 */
function stage(config, target, cwd, worktree) {
  for (const entry of readdirSync(worktree)) {
    if (entry !== '.git') {
      rmSync(join(worktree, entry), { recursive: true, force: true });
    }
  }

  copyTree(join(cwd, target.from), worktree, target.hide);
  for (const file of target.files) {
    copyFileSync(join(cwd, file), join(worktree, file));
  }
  if (target.packageJson) {
    writeFileSync(
      join(worktree, 'package.json'),
      releasePackageJson(config.pkg),
    );
  }
  git(['add', '-A'], worktree);
}

/**
 * Recursively copies files, skipping those whose relative path matches a hide glob.
 *
 * @param {string} source
 * @param {string} destination
 * @param {string[]} hide
 * @param {string} [prefix] Path of `source` relative to the copy root.
 * @returns {void}
 */
function copyTree(source, destination, hide, prefix = '') {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) {
      copyTree(
        join(source, entry.name),
        join(destination, entry.name),
        hide,
        `${relative}/`,
      );
    } else if (!matchesAny(relative, hide)) {
      mkdirSync(dirname(join(destination, entry.name)), { recursive: true });
      copyFileSync(join(source, entry.name), join(destination, entry.name));
    }
  }
}

/**
 * @param {string} worktree
 * @returns {boolean}
 */
function hasStagedChanges(worktree) {
  return git(['diff', '--cached', '--name-only'], worktree) !== '';
}

/**
 * Pushes all branches and tags in a single atomic operation.
 *
 * @param {ReleaseConfig} config
 * @param {PreparedTarget[]} prepared
 * @param {string} cwd
 * @returns {void}
 * @throws {ReleaseError} When the remote rejects the push.
 */
function push(config, prepared, cwd) {
  const refs = prepared.flatMap(({ target, tag }) => [
    target.branch,
    `refs/tags/${tag}`,
  ]);
  try {
    git(['push', '--atomic', config.remote, ...refs], cwd);
  } catch (error) {
    throw new ReleaseError(
      `Push to ${config.remote} failed; local release commits and tags were kept. ${/** @type {Error} */ (error).message}`,
    );
  }
}
