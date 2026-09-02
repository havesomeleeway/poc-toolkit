// poc-kit init [dir] [--force]
// Scaffolds a bare structural skeleton. No widgets, no styling, no domain content.

import { resolve, join } from 'node:path';
import { mkdirSync, copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { parseArgs, TEMPLATES, head, ok, warn, info } from './util.mjs';

const FILES = [
  ['prototype.src.html', 'prototype.src.html'],
  ['build.config.json', 'build.config.json'],
  ['flow.json', 'flow.json'],
  ['HANDOFF.md', 'HANDOFF.md'],
];

export async function run(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log('poc-kit init [dir] [--force]\n  Scaffold prototype.src.html, build.config.json, flow.json, vendor/, HANDOFF.md');
    return;
  }
  const dir = resolve(process.cwd(), args._[0] || '.');
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, 'vendor'), { recursive: true });
  writeFileSync(join(dir, 'vendor', '.gitkeep'), '');

  head(`init  ${dir}`);
  for (const [dest, src] of FILES) {
    const target = join(dir, dest);
    if (existsSync(target) && !args.force) { warn(`${dest} exists — skipped (use --force)`); continue; }
    copyFileSync(join(TEMPLATES, src), target);
    ok(dest);
  }
  info('');
  info('next:  poc-kit add-ds <npm | url | --none>');
  info('       poc-kit add-font <family | ./file.woff2>   (optional)');
  info('       # build your screens in prototype.src.html');
  info('       poc-kit build && poc-kit verify');
}
