// Shared by the tests: run the real binary in a scratch directory.
import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PKG_ROOT } from '../src/util.mjs';

export const BIN = resolve(PKG_ROOT, 'bin', 'poc-kit.mjs');
export const SAMPLE = resolve(PKG_ROOT, 'test', 'fixtures', 'sample');

// Browser tests: a degraded (no Chrome) run fails instead of passing.
export const BROWSER_ENV = {
  POC_KIT_REQUIRE_CHROME: '1',
  POC_KIT_CHROME_FLAGS: process.env.POC_KIT_CHROME_FLAGS || '--no-sandbox --disable-dev-shm-usage',
};

export function pk(cwd, args, env = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], {
    cwd, encoding: 'utf8', timeout: 120_000, env: { ...process.env, CI: '', ...env },
  });
  return { code: r.status, out: r.stdout + r.stderr, stdout: r.stdout };
}

export const tmp = (prefix = 'pk-') => mkdtempSync(join(tmpdir(), prefix));

// Rough token count, as poc-kit reports it: characters ÷ 4.
export const tokens = (text) => Math.ceil(text.length / 4);
