// poc-kit build
// Inline vendor/* into the markers in the source HTML -> single output file, then
// run the offline-safety linter. Non-zero exit if the result is not self-contained.

import { resolve, dirname } from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parseArgs, readConfig, head, ok, warn, fail } from './util.mjs';
import { lintOffline, printReport } from './lint-offline.mjs';
import { validateProfile } from './ds-profile.mjs';
import { lintDs, printLintDs, validateAllow } from './lint-ds.mjs';
import { classSet } from './css-scan.mjs';

export async function run(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log('poc-kit build [--config build.config.json] [--all]\n  Inline vendor/* into the markers, lint for offline-safety, then lint the source\n  against the design-system profile (--all: every problem, not 10 per rule).\n  Exceptions: "allow" in build.config.json.');
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
  const source = html;
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

  head('design-system profile');
  const profilePath = resolve(process.cwd(), cfg.profile || 'vendor/ds-profile.json');
  if (!existsSync(profilePath)) {
    warn('no design-system profile — run "poc-kit add-ds" so components can be looked up and checked');
    return;
  }
  let profile;
  try { profile = JSON.parse(readFileSync(profilePath, 'utf8')); } catch (e) {
    fail(`${cfg.profile || 'vendor/ds-profile.json'} is not valid JSON: ${e.message}`);
    process.exit(1);
  }
  const problems = validateProfile(profile);
  if (problems.length) {
    for (const p of problems) fail(p);
    fail('the design-system profile is invalid — run "poc-kit ds validate"');
    process.exit(1);
  }
  if (profile.reviewed) ok(`${profile.name}${profile.version ? ` ${profile.version}` : ''}: ${profile.components.length} components`);
  else warn(`DRAFT profile (${profile.name}): not reviewed, so lookups and checks may be wrong`);

  head(`design-system lint  ${cfg.src || 'prototype.src.html'}`);
  const allowProblems = validateAllow(cfg.allow);
  if (allowProblems.length) {
    for (const p of allowProblems) fail(`build.config.json: ${p}`);
    process.exit(1);
  }
  const layoutPath = resolve(dirname(srcPath), 'vendor/layout.css');
  const layoutClasses = existsSync(layoutPath) ? [...classSet(readFileSync(layoutPath, 'utf8'))] : [];
  const dsPath = resolve(dirname(srcPath), 'vendor/ds.css');
  const css = existsSync(dsPath) ? readFileSync(dsPath, 'utf8') : undefined;
  const lint = lintDs(source, { profile, css, layoutClasses, allow: cfg.allow || [] });
  printLintDs(lint, { all: Boolean(args.all) });
  if (!lint.ok) {
    fail(`${lint.violations.length} design-system problem(s) — fix them, or add a reasoned exception to "allow" in build.config.json`);
    process.exit(1);
  }
}
