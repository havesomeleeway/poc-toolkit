// Runs the real binary in a scratch dir. No network, no Chrome.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PKG_ROOT } from '../../src/util.mjs';

const BIN = resolve(PKG_ROOT, 'bin', 'poc-kit.mjs');

function pk(cwd, args, env = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, CI: '', ...env },
  });
  return { code: r.status, out: r.stdout + r.stderr };
}

function scaffold() {
  const dir = mkdtempSync(join(tmpdir(), 'pk-cli-'));
  assert.equal(pk(dir, ['init', '.']).code, 0);
  assert.equal(pk(dir, ['add-ds', '--none']).code, 0);
  return dir;
}

test('help lists every command the binary accepts', () => {
  const src = readFileSync(BIN, 'utf8');
  const commands = [...src.matchAll(/^\s+'?([a-z-]+)'?:\s*\(\) => import/gm)].map((m) => m[1]);
  assert.ok(commands.length > 0);
  const { out } = pk(PKG_ROOT, ['--help']);
  for (const c of commands) assert.match(out, new RegExp(`^\\s+${c}\\b`, 'm'), `help is missing "${c}"`);
});

test('unknown command exits 1', () => {
  const r = pk(PKG_ROOT, ['nope']);
  assert.equal(r.code, 1);
  assert.match(r.out, /unknown command "nope"/);
});

test('init writes the scaffold and does not overwrite without --force', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pk-cli-'));
  pk(dir, ['init', '.']);
  for (const f of ['prototype.src.html', 'build.config.json', 'flow.json', 'HANDOFF.md', 'vendor/layout.css']) {
    assert.ok(existsSync(join(dir, f)), `missing ${f}`);
  }
  writeFileSync(join(dir, 'flow.json'), 'mine');
  assert.match(pk(dir, ['init', '.']).out, /flow.json exists — skipped/);
  assert.equal(readFileSync(join(dir, 'flow.json'), 'utf8'), 'mine');
});

test('add-ds --none writes the neutral kit and a report', () => {
  const dir = scaffold();
  assert.ok(existsSync(join(dir, 'vendor/ds.css')));
  assert.match(readFileSync(join(dir, 'vendor/ds-report.md'), 'utf8'), /# Design system report/);
});

test('build inlines vendor CSS and passes the offline lint', () => {
  const dir = scaffold();
  const r = pk(dir, ['build']);
  assert.equal(r.code, 0, r.out);
  const html = readFileSync(join(dir, 'prototype.html'), 'utf8');
  assert.ok(!html.includes('/*__DS_CSS__*/'), 'marker was not replaced');
  assert.ok(html.includes(readFileSync(join(dir, 'vendor/ds.css'), 'utf8')), 'ds.css was not inlined');
});

test('build fails when the source references the network', () => {
  const dir = scaffold();
  const src = join(dir, 'prototype.src.html');
  writeFileSync(src, readFileSync(src, 'utf8').replace('</body>', '<script src="https://x.com/a.js"></script></body>'));
  const r = pk(dir, ['build']);
  assert.equal(r.code, 1);
  assert.match(r.out, /external <script src>/);
});

test('build without build.config.json fails clearly', () => {
  const r = pk(mkdtempSync(join(tmpdir(), 'pk-cli-')), ['build']);
  assert.equal(r.code, 1);
  assert.match(r.out, /no build.config.json/);
});

test('verify without Chrome passes as DEGRADED', () => {
  const dir = scaffold();
  pk(dir, ['build']);
  const r = pk(dir, ['verify'], { POC_KIT_NO_CHROME: '1' });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /DEGRADED/);
});

test('verify without Chrome fails when POC_KIT_REQUIRE_CHROME is set', () => {
  const dir = scaffold();
  pk(dir, ['build']);
  const r = pk(dir, ['verify'], { POC_KIT_NO_CHROME: '1', POC_KIT_REQUIRE_CHROME: '1' });
  assert.equal(r.code, 1);
  assert.match(r.out, /POC_KIT_REQUIRE_CHROME/);
});

test('verify catches an inline script syntax error', () => {
  const dir = scaffold();
  const src = join(dir, 'prototype.src.html');
  writeFileSync(src, readFileSync(src, 'utf8').replace('</body>', '<script>let = ;</script></body>'));
  pk(dir, ['build']);
  const r = pk(dir, ['verify'], { POC_KIT_NO_CHROME: '1' });
  assert.equal(r.code, 1);
  assert.match(r.out, /syntax error/);
});

test('add-font embeds a local font as base64', () => {
  const dir = scaffold();
  writeFileSync(join(dir, 'f.woff2'), Buffer.from([1, 2, 3, 4]));
  const r = pk(dir, ['add-font', './f.woff2', '--family', 'Test']);
  assert.equal(r.code, 0, r.out);
  const css = readFileSync(join(dir, 'vendor/font.css'), 'utf8');
  assert.match(css, /@font-face/);
  assert.match(css, /data:font\/woff2;base64,AQIDBA==/);
});

test('handoff writes HANDOFF.md and does not overwrite without --force', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pk-cli-'));
  assert.equal(pk(dir, ['handoff']).code, 0);
  assert.ok(existsSync(join(dir, 'HANDOFF.md')));
  assert.match(pk(dir, ['handoff']).out, /exists — skipped/);
});
