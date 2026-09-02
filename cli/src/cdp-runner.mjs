// Execute a flow.json against a headless Chrome via the DevTools Protocol.
// Step types: click, setValue, wait, eval, expectVisible, expectHidden,
// expectText, expectNoConsoleErrors, screenshot, pdf.
// Plus an optional a11y smoke pass when flow.a11y is true.

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import net from 'node:net';
import CDP from 'chrome-remote-interface';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function freePort(start = 9222) {
  for (let p = start; p < start + 200; p++) {
    const free = await new Promise((res) => {
      const s = net.createServer();
      s.once('error', () => res(false));
      s.once('listening', () => s.close(() => res(true)));
      s.listen(p, '127.0.0.1');
    });
    if (free) return p;
  }
  throw new Error('no free port for Chrome');
}

export async function runFlow(flow, { chromePath, flowDir = process.cwd(), outDir = resolve(process.cwd(), 'out') }) {
  mkdirSync(outDir, { recursive: true });
  const port = await freePort();
  const userDir = resolve(outDir, `.chrome-${Date.now()}`);
  // Containers / CI usually need --no-sandbox --disable-dev-shm-usage; pass them via
  // POC_KIT_CHROME_FLAGS rather than baking assumptions in.
  const extraFlags = (process.env.POC_KIT_CHROME_FLAGS || '').split(/\s+/).filter(Boolean);
  const proc = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${userDir}`,
    ...extraFlags, 'about:blank',
  ], { stdio: 'ignore' });

  const results = [];
  const consoleErrors = [];
  const artifacts = [];
  const rec = (name, pass, detail) => results.push({ name, pass, detail });

  let client;
  try {
    // wait for the debugger endpoint
    for (let i = 0; i < 60; i++) {
      try { client = await CDP({ port }); break; } catch { await sleep(250); }
    }
    if (!client) throw new Error('Chrome did not expose a debugging port');

    const { Page, Runtime, DOM, Input, Emulation } = client;
    await Page.enable(); await Runtime.enable(); await DOM.enable();

    Runtime.exceptionThrown((p) => {
      const d = p.exceptionDetails;
      consoleErrors.push('exception: ' + (d.exception?.description || d.text || 'unknown'));
    });
    Runtime.consoleAPICalled((p) => {
      if (p.type === 'error') {
        consoleErrors.push('console.error: ' + p.args.map((a) => a.value ?? a.description ?? '').join(' '));
      }
    });

    if (Array.isArray(flow.viewport)) {
      await Emulation.setDeviceMetricsOverride({
        width: flow.viewport[0], height: flow.viewport[1], deviceScaleFactor: 1, mobile: false,
      });
    }

    const url = toFileUrl(flow.url || 'prototype.html', flowDir);
    await Page.navigate({ url });
    await Page.loadEventFired();
    await sleep(flow.settleMs ?? 350);

    const ev = async (expr) =>
      (await Runtime.evaluate({ expression: expr, returnByValue: true, awaitPromise: true })).result.value;
    const q = (sel) => JSON.stringify(sel);

    for (const [i, step] of (flow.steps || []).entries()) {
      const label = describe(step, i);
      try {
        if ('click' in step) {
          const hit = await ev(`(()=>{const e=document.querySelector(${q(step.click)});if(!e)return false;e.click();return true})()`);
          if (!hit) throw new Error(`no element ${step.click}`);
          await sleep(step.after ?? 120);
          rec(label, true);
        } else if ('setValue' in step) {
          const hit = await ev(`(()=>{const e=document.querySelector(${q(step.setValue)});if(!e)return false;e.value=${JSON.stringify(step.to ?? '')};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
          if (!hit) throw new Error(`no element ${step.setValue}`);
          await sleep(step.after ?? 100);
          rec(label, true);
        } else if ('wait' in step) {
          await sleep(Number(step.wait) || 0);
          rec(label, true);
        } else if ('eval' in step) {
          const val = await ev(`(${step.eval})`);
          const pass = ('equals' in step) ? val === step.equals : Boolean(val);
          rec(label, pass, pass ? undefined : `got ${JSON.stringify(val)}`);
        } else if ('expectVisible' in step) {
          const vis = await ev(visibleExpr(step.expectVisible));
          rec(label, vis === true, vis === true ? undefined : 'not visible');
        } else if ('expectHidden' in step) {
          const vis = await ev(visibleExpr(step.expectHidden));
          rec(label, vis === false, vis === false ? undefined : 'still visible');
        } else if ('expectText' in step) {
          const txt = await ev(`(()=>{const e=document.querySelector(${q(step.expectText)});return e?e.textContent:null})()`);
          const need = step.contains ?? '';
          const pass = typeof txt === 'string' && txt.includes(need);
          rec(label, pass, pass ? undefined : `text was ${JSON.stringify((txt || '').slice(0, 80))}`);
        } else if ('expectNoConsoleErrors' in step) {
          const pass = consoleErrors.length === 0;
          rec(label, pass, pass ? undefined : `${consoleErrors.length} so far`);
        } else if ('screenshot' in step) {
          const { data } = await Page.captureScreenshot({ format: 'png' });
          const file = resolve(outDir, `${sanitize(step.screenshot)}.png`);
          writeFileSync(file, Buffer.from(data, 'base64'));
          artifacts.push(file);
          rec(label, true);
        } else if ('pdf' in step) {
          const { data } = await Page.printToPDF({ preferCSSPageSize: true, printBackground: false });
          const target = isAbsolute(step.pdf) ? step.pdf : resolve(process.cwd(), step.pdf);
          mkdirSync(dirname(target), { recursive: true });
          writeFileSync(target, Buffer.from(data, 'base64'));
          artifacts.push(target);
          rec(label, true);
        } else {
          rec(label, false, 'unknown step type');
        }
      } catch (err) {
        rec(label, false, err.message);
      }
    }

    if (flow.a11y) {
      for (const check of await a11ySmoke(ev)) rec(`a11y: ${check.name}`, check.pass, check.detail);
    }
  } finally {
    if (client) { try { await client.close(); } catch {} }
    proc.kill();
  }

  return { results, consoleErrors, artifacts };
}

function toFileUrl(u, dir) {
  if (/^https?:|^file:/.test(u)) return u;
  const p = isAbsolute(u) ? u : resolve(dir, u);
  return pathToFileURL(p).href;
}
function sanitize(s) { return String(s).replace(/[^a-z0-9_-]+/gi, '-'); }
function describe(step, i) {
  const k = Object.keys(step)[0];
  const v = step[k];
  return `step ${i + 1}: ${k} ${typeof v === 'string' ? v : JSON.stringify(v)}`.slice(0, 100);
}
function visibleExpr(sel) {
  return `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;` +
    `if(e.hidden)return false;const s=getComputedStyle(e);` +
    `if(s.display==='none'||s.visibility==='hidden'||s.opacity==='0')return false;` +
    `const r=e.getBoundingClientRect();return r.width>0&&r.height>0})()`;
}

async function a11ySmoke(ev) {
  const out = [];
  out.push({
    name: 'form controls have an accessible name',
    ...bool(await ev(`[...document.querySelectorAll('input,select,textarea')].every(el=>(el.labels&&el.labels.length)||el.getAttribute('aria-label')||el.getAttribute('aria-labelledby')||el.getAttribute('title'))`)),
  });
  out.push({
    name: 'a :focus-visible style rule exists',
    ...bool(await ev(`[...document.styleSheets].some(ss=>{try{return[...ss.cssRules].some(r=>r.selectorText&&r.selectorText.includes(':focus-visible'))}catch(e){return false}})`)),
  });
  out.push({
    name: 'decorative <svg> are aria-hidden or labelled',
    ...bool(await ev(`[...document.querySelectorAll('svg')].every(s=>s.getAttribute('aria-hidden')==='true'||s.getAttribute('role')==='img'||s.querySelector('title'))`)),
  });
  out.push({
    name: 'body has an explicit background colour',
    ...bool(await ev(`getComputedStyle(document.body).backgroundColor!=='rgba(0, 0, 0, 0)'`)),
  });
  out.push({
    name: 'document has a non-empty <title>',
    ...bool(await ev(`!!document.title && document.title.trim().length>0`)),
  });
  return out;
}
function bool(v) { return v ? { pass: true } : { pass: false, detail: 'failed' }; }
