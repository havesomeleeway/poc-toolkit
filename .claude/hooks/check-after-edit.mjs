#!/usr/bin/env node
// Claude Code PostToolUse hook. After an edit, run the fast checks for what was touched and
// hand any failure back to the agent (exit 2 + stderr). Skips silently if cli/ deps aren't installed.

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLI = resolve(REPO, 'cli');

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8')); } catch { process.exit(0); }
const file = input.tool_input && input.tool_input.file_path;
if (!file) process.exit(0);
const rel = relative(REPO, resolve(file));

const DOCS = /^(METHOD\.md|README\.md|CONTRIBUTING\.md|claude\/.*\.md|copilot\/.*\.md|cli\/README\.md|cli\/templates\/copilot\/.*\.md)$/;
const CODE = /^cli\/(bin|src|test|scripts)\/.*\.mjs$|^cli\/(schema|templates)\//;

const steps = [];
if (CODE.test(rel)) steps.push('npx eslint --no-warn-ignored ' + JSON.stringify(relative(CLI, resolve(file))), 'npm test --silent');
if (CODE.test(rel) || DOCS.test(rel)) steps.push('node scripts/check-docs.mjs');
if (!steps.length) process.exit(0);
if (!existsSync(resolve(CLI, 'node_modules'))) process.exit(0);

for (const cmd of steps) {
  try {
    execSync(cmd, { cwd: CLI, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 110_000 });
  } catch (e) {
    const out = `${e.stdout || ''}${e.stderr || ''}`.trim().split('\n');
    // node --test prints a lot; keep the failures.
    const failing = out.filter((l) => /not ok|✖|Error|error|problem|FAIL|  - /.test(l) && !/# TODO/.test(l));
    console.error(`check after editing ${rel} failed: ${cmd}\n${(failing.length ? failing : out).slice(0, 40).join('\n')}`);
    process.exit(2);
  }
}
