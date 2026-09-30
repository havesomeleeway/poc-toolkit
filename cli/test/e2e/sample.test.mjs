// The tagged sample dashboard: lint-clean build, and its flow passes in a real browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, cpSync } from 'node:fs';
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
const pk = (cwd, args) => {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', env: ENV, timeout: 120_000 });
  return { code: r.status, out: r.stdout + r.stderr };
};

test('the sample dashboard builds lint-clean and its flow passes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pk-sample-'));
  cpSync(resolve(PKG_ROOT, 'test', 'fixtures', 'sample'), dir, { recursive: true });
  for (const args of [['init', '.'], ['add-ds', '--none']]) assert.equal(pk(dir, args).code, 0);
  const b = pk(dir, ['build']);
  assert.equal(b.code, 0, b.out);
  assert.match(b.out, /10 tagged components, 2 screens, 2 features/);
  const v = pk(dir, ['verify']);
  assert.equal(v.code, 0, v.out);
  assert.match(v.out, /^PASS$/m);
});
