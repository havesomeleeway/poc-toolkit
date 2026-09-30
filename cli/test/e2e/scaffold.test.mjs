// End to end with a real browser: init -> add-ds --none -> build -> verify.
// Requires Chrome/Chromium (set CHROME_PATH if it isn't auto-found). A DEGRADED run fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PKG_ROOT } from '../../src/util.mjs';

const BIN = resolve(PKG_ROOT, 'bin', 'poc-kit.mjs');
const ENV = {
  ...process.env,
  CI: '',
  POC_KIT_REQUIRE_CHROME: '1',
  POC_KIT_CHROME_FLAGS: process.env.POC_KIT_CHROME_FLAGS || '--no-sandbox --disable-dev-shm-usage',
};

function pk(cwd, args) {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', env: ENV, timeout: 120_000 });
  return { code: r.status, out: r.stdout + r.stderr };
}

test('the fresh scaffold builds and verifies in a real browser', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pk-e2e-'));
  for (const args of [['init', '.'], ['add-ds', '--none'], ['build']]) {
    const r = pk(dir, args);
    assert.equal(r.code, 0, `${args.join(' ')} failed:\n${r.out}`);
  }
  const r = pk(dir, ['verify']);
  assert.equal(r.code, 0, `verify failed:\n${r.out}`);
  assert.doesNotMatch(r.out, /DEGRADED/);
  assert.match(r.out, /^PASS$/m);
  assert.match(r.out, /console errors: 0/);
  assert.ok(existsSync(join(dir, 'out', 'initial.png')), 'desktop screenshot missing');
  assert.ok(existsSync(join(dir, 'out', 'mobile', 'initial.png')), 'mobile screenshot missing');
});
