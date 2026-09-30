#!/usr/bin/env node
// Fails when the docs and the CLI disagree. CONTRIBUTING.md says METHOD.md and its two adapters
// (the Claude skill and the Copilot prompt) must stay in sync; this checks the parts a script can.
//
//   1. Every command the binary accepts is listed in cli/README.md.
//   2. Every `poc-kit <word>` inside code in any doc names a real command.
//   3. METHOD.md, SKILL.md and the Copilot prompt mention the same set of commands.
//   4. They have the same number of workflow steps.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(CLI, '..');
const read = (p) => readFileSync(join(REPO, p), 'utf8');

const METHOD = 'METHOD.md';
const SKILL = 'claude/skills/interactive-poc/SKILL.md';
const PROMPT = 'cli/templates/copilot/interactive-poc.prompt.md';

const commands = new Set(
  [...read('cli/bin/poc-kit.mjs').matchAll(/^\s+'?([a-z-]+)'?:\s*\(\) => import/gm)].map((m) => m[1]),
);

const problems = [];

// Text inside inline `code` spans and ``` fences only — prose like "the poc-kit tool" is ignored.
function codeText(md) {
  const fences = [...md.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1]);
  const withoutFences = md.replace(/```[\s\S]*?```/g, '');
  const spans = [...withoutFences.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
  return [...fences, ...spans].join('\n');
}

function mentioned(md) {
  const words = [...codeText(md).matchAll(/(?:^|[\s(])(?:npx[ \t]+)?poc-kit[ \t]+([a-z][a-z-]*)/gm)].map((m) => m[1]);
  return new Set(words);
}

function markdownFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...markdownFiles(p));
    else if (name.endsWith('.md')) out.push(relative(REPO, p));
  }
  return out;
}

// 1
const readme = read('cli/README.md');
for (const c of commands) {
  if (!new RegExp(`^poc-kit ${c}\\b`, 'm').test(readme)) problems.push(`cli/README.md does not list "poc-kit ${c}"`);
}

// 2 — docs/ is design notes and proposals, which may name commands that don't exist yet.
for (const f of markdownFiles(REPO).filter((f) => !f.startsWith('docs/'))) {
  for (const w of mentioned(read(f))) {
    if (!commands.has(w)) problems.push(`${f} mentions "poc-kit ${w}", which is not a command`);
  }
}

// 3
const sets = [METHOD, SKILL, PROMPT].map((f) => [f, mentioned(read(f))]);
const [base, baseSet] = sets[0];
for (const [f, s] of sets.slice(1)) {
  const missing = [...baseSet].filter((c) => !s.has(c));
  const extra = [...s].filter((c) => !baseSet.has(c));
  if (missing.length) problems.push(`${f} does not mention ${missing.join(', ')} (named in ${base})`);
  if (extra.length) problems.push(`${f} mentions ${extra.join(', ')}, which ${base} does not`);
}

// 4
const steps = {
  [METHOD]: (read(METHOD).match(/^## \d+\./gm) || []).length,
  [SKILL]: (read(SKILL).match(/^\d+\. \*\*/gm) || []).length,
  [PROMPT]: (read(PROMPT).match(/^\d+\. \*\*/gm) || []).length,
};
if (new Set(Object.values(steps)).size !== 1) {
  problems.push(`workflow step counts differ: ${Object.entries(steps).map(([f, n]) => `${f}=${n}`).join(', ')}`);
}

if (problems.length) {
  console.error(`check-docs: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`check-docs: ok (${commands.size} commands, ${steps[METHOD]} workflow steps)`);
