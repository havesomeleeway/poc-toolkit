// poc-kit verify [file] [--flow flow.json]
// Static checks always. Headless-browser drive when Chrome is present; otherwise
// prints DEGRADED and passes on the static checks alone.

import { resolve, dirname } from 'node:path';
import { readFileSync, existsSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { parseArgs, readConfig, setQuiet, head, ok, warn, fail, info } from './util.mjs';
import { lintOffline, printReport } from './lint-offline.mjs';
import { findChrome } from './chrome.mjs';

export async function run(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(
      'poc-kit verify [file] [--flow flow.json] [--quiet] [--diff]\n' +
      '  Static offline + JS-syntax checks; headless-browser flow when Chrome is available.\n' +
      '  --quiet  suppress passing ("ok") lines — headers, warnings, failures and the tally still print.\n' +
      '           auto-enabled when $CI is set; pass --quiet=false to force verbose in CI.\n' +
      '  --diff   only show steps whose pass/fail changed since the last run\n' +
      '           (cached in .poc-kit/last-run.json), plus a count of unchanged steps.',
    );
    return;
  }

  const ci = process.env.CI && process.env.CI !== 'false' && process.env.CI !== '0';
  const quiet = args.quiet !== undefined ? args.quiet !== 'false' && args.quiet !== false : Boolean(ci);
  setQuiet(quiet);
  const diffMode = Boolean(args.diff);
  const cachePath = resolve(process.cwd(), '.poc-kit', 'last-run.json');
  let prevRun = null;
  if (diffMode && existsSync(cachePath)) {
    try { prevRun = JSON.parse(readFileSync(cachePath, 'utf8')); } catch { /* ignore a corrupt cache */ }
  }
  const currentRun = {};
  let unchangedCount = 0;
  let totalPass = 0, totalFail = 0, totalAdvisory = 0;

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

  const { runFlow } = await import('./cdp-runner.mjs');
  const flow = existsSync(flowPath)
    ? JSON.parse(readFileSync(flowPath, 'utf8'))
    : { url: file, steps: [{ expectNoConsoleErrors: true }], a11y: false };
  if (!existsSync(flowPath)) flow.url = file;
  const flowDir = existsSync(flowPath) ? dirname(flowPath) : process.cwd();

  async function runPass(label, flowForPass, outDir) {
    head(label);
    const { results, consoleErrors, artifacts } = await runFlow(flowForPass, {
      chromePath: chrome,
      flowDir,
      outDir,
    });

    // Flow steps + console errors are the gate. The a11y smoke is advisory only.
    let passOk = true;
    for (const r of results) {
      const isA11y = r.name.startsWith('a11y:');
      if (r.pass) totalPass++;
      else if (isA11y) totalAdvisory++;
      else { totalFail++; passOk = false; }

      const key = `${label}::${r.name}`;
      currentRun[key] = r.pass;
      const changed = !prevRun || !(key in prevRun) || prevRun[key] !== r.pass;
      if (diffMode && !changed) { unchangedCount++; continue; }

      if (r.pass) ok(r.name);
      else if (isA11y) warn(`${r.name}${r.detail ? ' — ' + r.detail : ''}  (advisory)`);
      else fail(`${r.name}${r.detail ? ' — ' + r.detail : ''}`);
    }
    head(`console errors: ${consoleErrors.length}`);
    for (const e of consoleErrors) fail(e);
    if (consoleErrors.length) passOk = false;

    if (artifacts.length) {
      head('artifacts');
      for (const a of artifacts) info(rel(a));
    }
    return passOk;
  }

  const desktopLabel = existsSync(flowPath) ? rel(flowPath) : 'no flow.json — page-load check only';
  let driveOk = await runPass(`drive: ${desktopLabel}`, flow, resolve(process.cwd(), 'out'));

  const mobileEnabled = flow.mobileCheck !== false;
  if (mobileEnabled) {
    const mobileViewport = flow.mobileViewport || [375, 812];
    const mobileFlow = { ...flow, viewport: mobileViewport };
    const mobileOk = await runPass(
      `drive: ${desktopLabel} @${mobileViewport[0]}px`,
      mobileFlow,
      resolve(process.cwd(), 'out', 'mobile'),
    );
    driveOk = driveOk && mobileOk;
  }

  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, JSON.stringify(currentRun));

  head(staticOk && driveOk ? 'PASS' : 'FAIL');
  info(`${totalPass} passed, ${totalFail} failed${totalAdvisory ? ` (${totalAdvisory} advisory)` : ''}`);
  if (diffMode) info(prevRun ? `${unchangedCount} unchanged since last run` : 'no previous run to diff against — showing all');
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
