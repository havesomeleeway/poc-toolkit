// End to end with a real browser: init -> add-ds --none -> build -> verify.
// Requires Chrome/Chromium (set CHROME_PATH if it isn't auto-found). A DEGRADED run fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pk as run, tmp, BROWSER_ENV } from '../helpers.mjs';

const pk = (cwd, args) => run(cwd, args, BROWSER_ENV);

test('the fresh scaffold builds and verifies in a real browser', () => {
  const dir = tmp();
  for (const args of [['init', '.'], ['add-ds', '--none'], ['build']]) {
    const r = pk(dir, args);
    assert.equal(r.code, 0, `${args.join(' ')} failed:\n${r.out}`);
  }
  const r = pk(dir, ['verify']);
  assert.equal(r.code, 0, `verify failed:\n${r.out}`);
  assert.doesNotMatch(r.out, /DEGRADED/);
  assert.match(r.out, /^PASS$/m);
  assert.ok(existsSync(join(dir, 'out', 'initial.png')), 'desktop screenshot missing');
  assert.ok(existsSync(join(dir, 'out', 'mobile', 'initial.png')), 'mobile screenshot missing');
});
