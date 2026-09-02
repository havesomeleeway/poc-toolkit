// poc-kit build
// Inline vendor/* into the markers in the source HTML -> single output file, then
// run the offline-safety linter. Non-zero exit if the result is not self-contained.

import { resolve, dirname } from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseArgs, readConfig, head, ok, warn, fail } from './util.mjs';
import { lintOffline, printReport } from './lint-offline.mjs';

export async function run(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log('poc-kit build [--config build.config.json]\n  Inline vendor/* into the markers, then lint for offline-safety.');
    return;
  }
  const cfg = args.config
    ? JSON.parse(readFileSync(resolve(process.cwd(), args.config), 'utf8'))
    : readConfig();
  if (!cfg) throw new Error('no build.config.json (run "poc-kit init" first)');

  const srcPath = resolve(process.cwd(), cfg.src || 'prototype.src.html');
  const outPath = resolve(process.cwd(), cfg.out || 'prototype.html');
  if (!existsSync(srcPath)) throw new Error(`source not found: ${cfg.src}`);

  let html = readFileSync(srcPath, 'utf8');
  head(`build  ${cfg.src} -> ${cfg.out}`);

  const markers = cfg.markers || {};
  for (const [marker, file] of Object.entries(markers)) {
    if (!html.includes(marker)) { warn(`marker not found in source: ${marker}`); continue; }
    const fpath = resolve(dirname(srcPath), file);
    let content = '';
    if (existsSync(fpath)) {
      content = readFileSync(fpath, 'utf8');
      ok(`${marker} <- ${file} (${(Buffer.byteLength(content) / 1024).toFixed(1)} KB)`);
    } else {
      warn(`${marker}: ${file} missing — inlined as empty`);
    }
    html = html.split(marker).join(content);
  }

  writeFileSync(outPath, html);
  ok(`wrote ${cfg.out} (${(Buffer.byteLength(html) / 1024).toFixed(1)} KB)`);

  head('offline-safety');
  const result = lintOffline(html);
  printReport(result);
  if (!result.ok) {
    fail('build output is not self-contained — fix the references above');
    process.exit(1);
  }
}
