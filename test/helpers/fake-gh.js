#!/usr/bin/env node
// @ts-check
// Stand-in for the GitHub CLI. Logs every call to $FAKE_GH_LOG; $FAKE_GH_VIEW and $FAKE_GH_CREATE pick the outcome.
import { appendFileSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const [command, subcommand] = args;
const stdin = args.includes('-') ? readFileSync(0, 'utf8') : '';
appendFileSync(
  /** @type {string} */ (process.env.FAKE_GH_LOG),
  `${JSON.stringify({ args, stdin })}\n`,
);

if (command === 'release' && subcommand === 'view') {
  const view = process.env.FAKE_GH_VIEW;
  if (view === 'absent') {
    process.stderr.write('release not found\n');
    process.exit(1);
  }
  if (view === 'error') {
    process.stderr.write('HTTP 401: Bad credentials\n');
    process.exit(1);
  }
  process.stdout.write(`${JSON.stringify({ isDraft: view === 'draft' })}\n`);
} else if (command === 'release' && subcommand === 'create') {
  if (process.env.FAKE_GH_CREATE === 'fail') {
    process.stderr.write('HTTP 422: Validation Failed\n');
    process.exit(1);
  }
} else {
  process.stderr.write(`unexpected gh call: ${args.join(' ')}\n`);
  process.exit(1);
}
