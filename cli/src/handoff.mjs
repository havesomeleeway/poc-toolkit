// poc-kit handoff [--out HANDOFF.md] [--force]
// Emit a blank hand-off skeleton. Depth and format are the user's call.

import { resolve } from 'node:path';
import { copyFileSync, existsSync } from 'node:fs';
import { parseArgs, TEMPLATES, head, ok, warn } from './util.mjs';

export async function run(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log('poc-kit handoff [--out HANDOFF.md] [--force]');
    return;
  }
  const out = resolve(process.cwd(), args.out || 'HANDOFF.md');
  head('handoff');
  if (existsSync(out) && !args.force) { warn(`${args.out || 'HANDOFF.md'} exists — skipped (use --force)`); return; }
  copyFileSync(resolve(TEMPLATES, 'HANDOFF.md'), out);
  ok(`wrote ${args.out || 'HANDOFF.md'} — fill in what the audience needs, delete the rest`);
}
