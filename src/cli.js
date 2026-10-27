// @ts-check
import pkg from '../package.json' with { type: 'json' };
import { ReleaseError } from './errors.js';
import { release } from './release.js';

const USAGE = `Usage: gas-dev-release [--dry-run] [--target <branch>]...

Publishes the build of a gas-* library to its dist branch(es) with v-prefixed tags.

Options:
  --dry-run          Run all checks and show the staged changes; commit, tag and push nothing
  --target <branch>  Release only the given target (repeatable; default: all configured targets)
  -h, --help         Show this help
  --version          Show the version
`;

/**
 * Runs the CLI.
 *
 * @param {string[]} argv Command-line arguments, without the node and script paths.
 * @returns {Promise<number>} The process exit code.
 */
export async function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (argv.includes('--version')) {
    process.stdout.write(`${pkg.version}\n`);
    return 0;
  }
  try {
    release(process.cwd(), (message) => process.stdout.write(`${message}\n`));
    return 0;
  } catch (error) {
    if (error instanceof ReleaseError) {
      process.stderr.write(`gas-dev-release: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
}
