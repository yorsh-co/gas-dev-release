// @ts-check
import { execFileSync } from 'node:child_process';

/**
 * Runs git and returns its trimmed stdout.
 *
 * @param {string[]} args Git arguments.
 * @param {string} cwd Directory to run in.
 * @returns {string}
 * @throws {Error} With git's stderr when git exits non-zero.
 */
export function git(args, cwd) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    const { stderr } = /** @type {{ stderr?: string }} */ (error);
    const detail = stderr?.trim() || String(error);
    throw new Error(`git ${args.join(' ')} failed: ${detail}`, {
      cause: error,
    });
  }
}

/**
 * Runs git and reports whether it exited with status 0.
 *
 * @param {string[]} args Git arguments.
 * @param {string} cwd Directory to run in.
 * @returns {boolean}
 */
export function gitSucceeds(args, cwd) {
  try {
    execFileSync('git', args, { cwd, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
