#!/usr/bin/env node
// Fails when a file the CLI needs at runtime would not be in the published npm package.
// Every git-tracked file under bin/, src/, templates/ and schema/ must be in `npm pack`.

import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args) => execFileSync(cmd, args, { cwd: CLI, encoding: 'utf8' });

const [pack] = JSON.parse(run('npm', ['pack', '--dry-run', '--json', '--ignore-scripts']));
const packed = new Set(pack.files.map((f) => f.path));

const needed = run('git', ['ls-files', 'bin', 'src', 'templates', 'schema'])
  .split('\n')
  .filter(Boolean)
  .filter((f) => !f.endsWith('.gitkeep'));

const missing = needed.filter((f) => !packed.has(f));
const stray = [...packed].filter((f) => /^(test|scripts)\//.test(f) || f.startsWith('node_modules/'));

if (missing.length || stray.length) {
  for (const f of missing) console.error(`  - not packed: ${f} (add its folder to "files" in package.json)`);
  for (const f of stray) console.error(`  - packed but dev-only: ${f}`);
  process.exit(1);
}
console.log(`check-pack: ok (${packed.size} files, ${(pack.size / 1024).toFixed(1)} KB)`);
