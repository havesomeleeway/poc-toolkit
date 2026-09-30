#!/usr/bin/env node
// check-version-bump.mjs <base-ref>
// Fails when a change that ships to npm users doesn't bump cli/package.json's version.
// Tests, scripts, lint config and devDependencies don't ship, so they don't need a bump.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv[2] || 'origin/main';
const git = (...args) => execFileSync('git', args, { cwd: CLI, encoding: 'utf8' });

const SHIPPED = /^cli\/(bin|src|templates|schema)\/|^cli\/README\.md$/;
// package.json fields that change what users install or run.
const SHIPPED_FIELDS = ['name', 'type', 'bin', 'engines', 'files', 'dependencies', 'exports', 'main'];

const changed = git('diff', '--name-only', `${base}...HEAD`).split('\n').filter(Boolean);
const shippedFiles = changed.filter((f) => SHIPPED.test(f));

const now = JSON.parse(readFileSync(resolve(CLI, 'package.json'), 'utf8'));
let before = null;
try { before = JSON.parse(git('show', `${base}:cli/package.json`)); } catch { /* new package */ }

const shippedFields = before
  ? SHIPPED_FIELDS.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(now[k]))
  : [];

if (!before || (!shippedFiles.length && !shippedFields.length)) {
  console.log('check-version-bump: ok (nothing that ships to users changed)');
  process.exit(0);
}
if (before.version !== now.version) {
  console.log(`check-version-bump: ok (${before.version} -> ${now.version})`);
  process.exit(0);
}
console.error(`check-version-bump: cli/package.json is still ${now.version}, but this changes what users get:`);
for (const f of shippedFiles) console.error(`  - ${f}`);
for (const k of shippedFields) console.error(`  - package.json "${k}"`);
console.error('Run "npm version patch --no-git-tag-version" in cli/ (or minor/major).');
process.exit(1);
