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
 * @property {boolean} hasRemote Whether the branch existed on the remote before the release.
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
    const { worktree, hasRemote } = syncWorktree(config, target, cwd);
    log(`[${target.branch}] Syncing release contents...`);
    stage(config, target, cwd, worktree);
    return {
      target,
      worktree,
      tag: releaseTag(target, config.version),
      hasRemote,
    };
  });

  const changed = prepared.filter(({ worktree }) => hasStagedChanges(worktree));
  if (changed.length === 0) {
    const branches = prepared.map(({ target }) => target.branch).join(', ');
    throw new ReleaseError(
      `Nothing to release — ${branches} already matches the build.`,
    );
  }

  for (const { target, worktree } of prepared) {
    if (!changed.some((item) => item.worktree === worktree)) {
      log(`[${target.branch}] No changes — skipped`);
    }
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

  // The tool's own worktrees may be untracked in projects that do not ignore them.
  if (
    git(['status', '--porcelain', '--', '.', ':(exclude).worktrees'], cwd) !==
    ''
  ) {
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
    for (const { src } of target.files) {
      if (!isFile(join(cwd, src))) {
        throw new ReleaseError(
          `[${target.branch}] File ${src} does not exist — check "files".`,
        );
      }
    }
    for (const { from } of target.include) {
      if (!isDirectory(join(cwd, from))) {
        throw new ReleaseError(
          `[${target.branch}] Include ${from}/ does not exist — run the build first.`,
        );
      }
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
 * @param {string} path
 * @returns {boolean}
 */
function isFile(path) {
  return existsSync(path) && statSync(path).isFile();
}

/**
 * @param {string} path
 * @returns {boolean}
 */
function isDirectory(path) {
  return existsSync(path) && statSync(path).isDirectory();
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
 * @returns {{ worktree: string, hasRemote: boolean }} Absolute worktree path and whether the branch exists on the remote.
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
  return { worktree, hasRemote };
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

  copyTree(join(cwd, target.from), worktree, target.hide, target.exclude);
  for (const { from, to, hide } of target.include) {
    copyTree(join(cwd, from), join(worktree, to), hide, []);
  }
  for (const { src, dest } of target.files) {
    mkdirSync(dirname(join(worktree, dest)), { recursive: true });
    copyFileSync(join(cwd, src), join(worktree, dest));
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
 * Recursively copies files, skipping files that match a hide glob and files
 * and directories that match an exclude glob.
 *
 * @param {string} source
 * @param {string} destination
 * @param {string[]} hide
 * @param {string[]} exclude
 * @param {string} [prefix] Path of `source` relative to the copy root.
 * @returns {void}
 */
function copyTree(source, destination, hide, exclude, prefix = '') {
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}`;
    if (matchesAny(relative, exclude, entry.isDirectory())) continue;
    if (entry.isDirectory()) {
      copyTree(
        join(source, entry.name),
        join(destination, entry.name),
        hide,
        exclude,
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
      pushFailureMessage(config.remote, prepared, refs, error),
    );
  }
}

/**
 * Builds the push failure message, with the commands to retry or to undo the local release.
 *
 * @param {string} remote
 * @param {PreparedTarget[]} prepared
 * @param {string[]} refs Refs passed to `git push`.
 * @param {unknown} error The git failure.
 * @returns {string}
 */
function pushFailureMessage(remote, prepared, refs, error) {
  const reset = prepared.map(({ target, hasRemote }) =>
    hasRemote
      ? `  git -C .worktrees/${target.branch} reset --hard ${remote}/${target.branch}`
      : `  git worktree remove --force .worktrees/${target.branch} && git branch -D ${target.branch}`,
  );
  return [
    `Push to ${remote} failed; nothing was pushed, and the local release commits and tags were kept.`,
    /** @type {Error} */ (error).message,
    '',
    'Run from the project root. To retry the push:',
    `  git push --atomic ${remote} ${refs.join(' ')}`,
    '',
    'To discard the local release instead:',
    ...prepared.map(({ tag }) => `  git tag -d ${tag}`),
    ...reset,
  ].join('\n');
}
