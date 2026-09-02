// poc-kit verify [file] [--flow flow.json]
// Static checks always. Headless-browser drive when Chrome is present; otherwise
// prints DEGRADED and passes on the static checks alone.

import { resolve, dirname } from 'node:path';
import { readFileSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { parseArgs, readConfig, head, ok, warn, fail, info } from './util.mjs';
import { lintOffline, printReport } from './lint-offline.mjs';
import { findChrome } from './chrome.mjs';

export async function run(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log('poc-kit verify [file] [--flow flow.json]\n  Static offline + JS-syntax checks; headless-browser flow when Chrome is available.');
    return;
  }

  const cfg = readConfig();
  const file = resolve(process.cwd(), args._[0] || (cfg && cfg.out) || 'prototype.html');
  if (!existsSync(file)) throw new Error(`not found: ${file} (run "poc-kit build" first)`);
  const html = readFileSync(file, 'utf8');

  let staticOk = true;

  head(`verify  ${rel(file)}`);
  head('static: offline-safety');
  const lint = lintOffline(html);
  printReport(lint);
  staticOk = staticOk && lint.ok;

  head('static: inline <script> syntax');
  staticOk = checkScripts(html) && staticOk;

  const flowPath = resolve(process.cwd(), args.flow || 'flow.json');
  const chrome = findChrome();

  if (!chrome) {
    head('DEGRADED — headless Chrome not found; static checks only');
    info('set CHROME_PATH or install Chrome/Chromium to run the interaction flow.');
    process.exit(staticOk ? 0 : 1);
  }

  head(`drive: ${existsSync(flowPath) ? rel(flowPath) : 'no flow.json — page-load check only'}`);
  const { runFlow } = await import('./cdp-runner.mjs');
  const flow = existsSync(flowPath)
    ? JSON.parse(readFileSync(flowPath, 'utf8'))
    : { url: file, steps: [{ expectNoConsoleErrors: true }], a11y: false };
  if (!existsSync(flowPath)) flow.url = file;

  const { results, consoleErrors, artifacts } = await runFlow(flow, {
    chromePath: chrome,
    flowDir: existsSync(flowPath) ? dirname(flowPath) : process.cwd(),
    outDir: resolve(process.cwd(), 'out'),
  });

  // Flow steps + console errors are the gate. The a11y smoke is advisory only.
  let driveOk = true;
  for (const r of results) {
    const isA11y = r.name.startsWith('a11y:');
    if (r.pass) ok(r.name);
    else if (isA11y) warn(`${r.name}${r.detail ? ' — ' + r.detail : ''}  (advisory)`);
    else { fail(`${r.name}${r.detail ? ' — ' + r.detail : ''}`); driveOk = false; }
  }
  head(`console errors: ${consoleErrors.length}`);
  for (const e of consoleErrors) fail(e);
  if (consoleErrors.length) driveOk = false;

  if (artifacts.length) {
    head('artifacts');
    for (const a of artifacts) info(rel(a));
  }

  head(staticOk && driveOk ? 'PASS' : 'FAIL');
  process.exit(staticOk && driveOk ? 0 : 1);
}

function rel(p) { return p.replace(process.cwd() + '/', ''); }

function checkScripts(html) {
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  if (scripts.length === 0) { ok('no inline scripts'); return true; }
  const tmp = mkdtempSync(resolve(tmpdir(), 'poc-kit-'));
  const f = resolve(tmp, 'inline.js');
  writeFileSync(f, scripts.join('\n;\n'));
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: ['ignore', 'ignore', 'pipe'] });
    ok(`${scripts.length} inline <script> block(s) parse`);
    return true;
  } catch (e) {
    fail('inline script has a syntax error:');
    console.error(String(e.stderr || e.message).split('\n').slice(0, 6).map((l) => '          ' + l).join('\n'));
    return false;
  }
}
