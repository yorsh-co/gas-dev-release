// @ts-check
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ReleaseError } from './errors.js';

/**
 * @typedef {object} Target
 * @property {string} branch Release branch; also the release tag prefix.
 * @property {string} from Build directory, relative to the project root, copied to the branch root.
 * @property {string[]} hide Globs of build files that are never shipped.
 * @property {string[]} files Project-root files copied to the branch root.
 * @property {boolean} packageJson Whether to write the trimmed package.json.
 */

/**
 * @typedef {object} ReleaseConfig
 * @property {string} remote Remote that receives the branches and tags.
 * @property {string} version The project's version.
 * @property {Record<string, unknown>} pkg The project's package.json.
 * @property {Target[]} targets Resolved release targets.
 */

/** @type {Target} */
const DEFAULT_TARGET = {
  branch: 'dist',
  from: 'dist',
  hide: ['*.types.js'],
  files: ['README.md', 'LICENSE.md', 'CHANGELOG.md'],
  packageJson: true,
};

/**
 * Reads the project's package.json and resolves the release configuration.
 *
 * @param {string} cwd Project root.
 * @returns {ReleaseConfig}
 * @throws {ReleaseError} When package.json is missing, invalid or has no version.
 */
export function loadConfig(cwd) {
  /** @type {Record<string, unknown> & { version?: unknown, gasDevRelease?: { remote?: string } }} */
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
  } catch (error) {
    throw new ReleaseError(
      `Cannot read package.json in ${cwd}: ${/** @type {Error} */ (error).message}`,
    );
  }
  if (typeof pkg.version !== 'string' || pkg.version === '') {
    throw new ReleaseError('package.json has no "version".');
  }
  return {
    remote: pkg.gasDevRelease?.remote ?? 'origin',
    version: pkg.version,
    pkg,
    targets: [{ ...DEFAULT_TARGET }],
  };
}
