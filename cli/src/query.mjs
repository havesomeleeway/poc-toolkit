// poc-kit query --selector "<css selector>" [file] [--props p1,p2 | --props all]
// Launches the same headless Chrome `verify` uses and prints just the computed style of the
// first matching element — a cheap way to answer "what does selector X resolve to" without
// grepping or reading a built prototype's inlined (often single-line, minified) <style> block.

import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import { parseArgs, readConfig, head, info, fail } from './util.mjs';
import { findChrome } from './chrome.mjs';

// Small, commonly-useful default set — a full computed style has 300+ properties, which
// would defeat the point. Pass --props to ask for specific ones, or --props=all for everything.
const DEFAULT_PROPS = [
  'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index',
  'width', 'height', 'padding', 'margin', 'border', 'border-radius',
  'font-family', 'font-size', 'font-weight', 'line-height', 'color', 'background-color',
];

export async function run(argv) {
  const args = parseArgs(argv);
  if (args.help || !args.selector) {
    console.log(
      'poc-kit query --selector "<css selector>" [file] [--props p1,p2,... | --props all]\n' +
      '  Prints the computed style of the first element matching the selector.\n' +
      '  Defaults to a short, commonly-useful property set (layout/box/type/colour); pass\n' +
      '  --props for specific ones, or --props=all for the full computed style.',
    );
    return;
  }

  const cfg = readConfig();
  const file = resolve(process.cwd(), args._[0] || (cfg && cfg.out) || 'prototype.html');
  if (!existsSync(file)) throw new Error(`not found: ${file} (run "poc-kit build" first)`);

  const chrome = findChrome();
  if (!chrome) throw new Error('headless Chrome not found — set CHROME_PATH or install Chrome/Chromium.');

  const { launchChrome } = await import('./cdp-runner.mjs');
  const { client, close } = await launchChrome(chrome);
  try {
    const { Page, Runtime } = client;
    await Page.enable();
    await Runtime.enable();
    await Page.navigate({ url: pathToFileURL(file).href });
    await Page.loadEventFired();

    const ev = async (expr) =>
      (await Runtime.evaluate({ expression: expr, returnByValue: true, awaitPromise: true })).result.value;
    const sel = JSON.stringify(args.selector);

    const count = await ev(`document.querySelectorAll(${sel}).length`);
    if (!count) {
      fail(`no element matches ${args.selector}`);
      process.exitCode = 1;
      return;
    }

    const props = args.props === 'all' ? null
      : typeof args.props === 'string' ? args.props.split(',').map((s) => s.trim()).filter(Boolean)
        : DEFAULT_PROPS;

    const expr = props
      ? `(()=>{const e=document.querySelector(${sel});const s=getComputedStyle(e);const out={};` +
        `for(const p of ${JSON.stringify(props)})out[p]=s.getPropertyValue(p);return out})()`
      : `(()=>{const e=document.querySelector(${sel});const s=getComputedStyle(e);const out={};` +
        `for(let i=0;i<s.length;i++){const p=s[i];out[p]=s.getPropertyValue(p)}return out})()`;

    const styles = await ev(expr);
    head(`query  ${args.selector}${count > 1 ? `  (${count} matches — showing the first)` : ''}`);
    for (const [k, v] of Object.entries(styles)) info(`${k}: ${v}`);
  } finally {
    await close();
  }
}
