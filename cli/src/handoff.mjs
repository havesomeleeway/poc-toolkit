// poc-kit handoff [--out HANDOFF.md] [--force]
// poc-kit handoff --package [--note "..."]
//
// Plain mode: emit a blank hand-off skeleton. Depth and format are the user's call.
// --package mode: bundle the files a developer actually needs (HANDOFF.md, the built
// prototype, its source, the acquired design system + report, flow.json) into a
// timestamped folder under handoff/, and log the run in CHANGELOG.md with a list of
// what changed since the previous package.

import { resolve, join, relative, dirname } from 'node:path';
import {
  copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync,
  statSync, writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { parseArgs, readConfig, TEMPLATES, head, ok, warn, info, fail } from './util.mjs';

export async function run(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(
      'poc-kit handoff [--out HANDOFF.md] [--force]   Emit a blank HANDOFF.md skeleton.\n' +
      'poc-kit handoff --package [--note "..."]        Bundle HANDOFF.md + the prototype + its\n' +
      '                                                 sources into handoff/<timestamp>/ and log\n' +
      '                                                 the run in CHANGELOG.md.'
    );
    return;
  }
  if (args.package) return runPackage(args);

  const out = resolve(process.cwd(), args.out || 'HANDOFF.md');
  head('handoff');
  if (existsSync(out) && !args.force) { warn(`${args.out || 'HANDOFF.md'} exists — skipped (use --force)`); return; }
  copyFileSync(resolve(TEMPLATES, 'HANDOFF.md'), out);
  ok(`wrote ${args.out || 'HANDOFF.md'} — fill in what the audience needs, delete the rest`);
}

// Files a developer needs, not just an audience clicking through the demo. Copied as
// they are — no inlining — so the seam between the real design system and poc-kit's
// own scaffolding (vendor/layout.css, the .screen/data-nav router) stays visible.
async function runPackage(args) {
  const cwd = process.cwd();
  const cfg = readConfig(cwd) || {};
  const handoffMd = resolve(cwd, 'HANDOFF.md');

  head('handoff --package');
  if (!existsSync(handoffMd)) {
    fail('no HANDOFF.md — run "poc-kit handoff" first and fill it in, then package');
    process.exit(1);
  }

  const files = [
    { src: 'HANDOFF.md', required: true },
    { src: cfg.out || 'prototype.html', dest: 'prototype.html', required: true },
    { src: cfg.src || 'prototype.src.html', dest: 'prototype.src.html', required: true },
    { src: 'build.config.json', required: false },
    { src: 'flow.json', required: false },
  ];
  const dirs = [
    { src: 'vendor', required: true },
    { src: 'out', required: false }, // verify's screenshots — proof it was driven, not just built
  ];

  const stamp = timestampSlug();
  const pkgDir = resolve(cwd, 'handoff', stamp);
  mkdirSync(pkgDir, { recursive: true });

  for (const f of files) {
    const from = resolve(cwd, f.src);
    const dest = join(pkgDir, f.dest || f.src);
    if (!existsSync(from)) {
      if (f.required) { fail(`missing ${f.src} — run "poc-kit build" first`); process.exit(1); }
      warn(`${f.src} not found — skipped`);
      continue;
    }
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(from, dest);
    ok(f.dest || f.src);
  }
  for (const d of dirs) {
    const from = resolve(cwd, d.src);
    if (!existsSync(from)) {
      if (d.required) { fail(`missing ${d.src}/ — run "poc-kit build" first`); process.exit(1); }
      warn(`${d.src}/ not found — skipped`);
      continue;
    }
    cpSync(from, join(pkgDir, d.src), {
      recursive: true,
      filter: (src) => !src.endsWith('.gitkeep'),
    });
    ok(`${d.src}/`);
  }

  const previous = findPreviousPackage(resolve(cwd, 'handoff'), stamp);
  const diff = previous ? diffPackages(previous, pkgDir) : null;

  updateChangelog(cwd, { stamp, pkgDir: relative(cwd, pkgDir), note: args.note, diff, firstRun: !previous });

  info('');
  ok(`packaged -> ${relative(cwd, pkgDir)}/`);
  info('send that folder to the developer — CHANGELOG.md at the project root tracks each package.');
}

function timestampSlug(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function findPreviousPackage(handoffRoot, currentStamp) {
  if (!existsSync(handoffRoot)) return null;
  const prior = readdirSync(handoffRoot)
    .filter((name) => name !== currentStamp && statSync(join(handoffRoot, name)).isDirectory())
    .sort();
  return prior.length ? join(handoffRoot, prior[prior.length - 1]) : null;
}

function walkFiles(dir) {
  const out = [];
  (function walk(d) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(relative(dir, full));
    }
  })(dir);
  return out.sort();
}

function hashFile(p) {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

// Compares two package snapshots file-by-file (by content hash) and reports what a
// developer re-opening the folder would actually need to notice.
function diffPackages(prevDir, nextDir) {
  const prevFiles = new Set(walkFiles(prevDir));
  const nextFiles = new Set(walkFiles(nextDir));
  const added = [], removed = [], changed = [];
  for (const f of nextFiles) {
    if (!prevFiles.has(f)) { added.push(f); continue; }
    if (hashFile(join(prevDir, f)) !== hashFile(join(nextDir, f))) changed.push(f);
  }
  for (const f of prevFiles) if (!nextFiles.has(f)) removed.push(f);
  return { added: added.sort(), removed: removed.sort(), changed: changed.sort() };
}

function updateChangelog(cwd, { stamp, pkgDir, note, diff, firstRun }) {
  const path = resolve(cwd, 'CHANGELOG.md');
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '# Changelog\n\nEach entry is one `poc-kit handoff --package` run.\n';
  const body = existing.replace(/^# Changelog\n+(Each entry.*\n)?\n?/, '');

  const [datePart, timePart] = stamp.split('T');
  const readable = `${datePart} ${timePart.split('-').join(':')}`;
  const lines = [`## ${readable} — \`${pkgDir}/\``];
  if (note) lines.push('', String(note));
  if (firstRun) {
    lines.push('', '_first handoff package — nothing to diff against._');
  } else if (diff.added.length || diff.removed.length || diff.changed.length) {
    lines.push('', 'Changed since the previous package:');
    for (const f of diff.changed) lines.push(`- changed: \`${f}\``);
    for (const f of diff.added) lines.push(`- added: \`${f}\``);
    for (const f of diff.removed) lines.push(`- removed: \`${f}\``);
  } else {
    lines.push('', '_no file changes since the previous package._');
  }

  const entry = lines.join('\n') + '\n';
  writeFileSync(path, `# Changelog\n\nEach entry is one \`poc-kit handoff --package\` run.\n\n${entry}\n${body}`.replace(/\n{3,}/g, '\n\n'));
  ok('CHANGELOG.md updated');
}
