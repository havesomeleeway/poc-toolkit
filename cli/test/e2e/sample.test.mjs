// The tagged sample dashboard: lint-clean build, and its flow passes in a real browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync } from 'node:fs';
import { pk as run, tmp, tokens, SAMPLE, BROWSER_ENV } from '../helpers.mjs';

const pk = (cwd, args) => run(cwd, args, BROWSER_ENV);

test('the sample dashboard builds lint-clean and its flow passes', () => {
  const dir = tmp();
  cpSync(SAMPLE, dir, { recursive: true });
  for (const args of [['init', '.'], ['add-ds', '--none']]) assert.equal(pk(dir, args).code, 0);
  const b = pk(dir, ['build']);
  assert.equal(b.code, 0, b.out);
  assert.match(b.out, /10 tagged components, 2 screens, 2 features/);
  const v = pk(dir, ['verify']);
  assert.equal(v.code, 0, v.out);
  assert.match(v.out, /^PASS$/m);
  // Without a terminal (agents, CI) verify prints only failures, warnings and the tally.
  assert.ok(tokens(v.out) <= 100, `verify printed ~${tokens(v.out)} tokens:\n${v.out}`);
});
