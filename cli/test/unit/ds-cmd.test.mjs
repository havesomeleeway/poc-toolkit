// add-ds profiles and the `ds` command, run as real processes. No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PKG_ROOT } from '../../src/util.mjs';

const BIN = resolve(PKG_ROOT, 'bin', 'poc-kit.mjs');
const pk = (cwd, args) => {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: 'utf8', env: { ...process.env, CI: '' } });
  return { code: r.status, out: r.stdout + r.stderr, stdout: r.stdout };
};
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));

const CSS = `
:root { --t-accent: #06c; }
.btn { display: inline-block; padding: 4px 8px; color: var(--t-accent); }
.btn-primary { background: var(--t-accent); color: #fff; border: 0; }
`;

function project() {
  const dir = mkdtempSync(join(tmpdir(), 'pk-ds-'));
  assert.equal(pk(dir, ['init', '.']).code, 0);
  return dir;
}

test('add-ds --none writes the reviewed neutral profile and records it in build.config.json', () => {
  const dir = project();
  const r = pk(dir, ['add-ds', '--none']);
  assert.equal(r.code, 0, r.out);
  assert.equal(json(join(dir, 'vendor/ds-profile.json')).reviewed, true);
  assert.equal(json(join(dir, 'build.config.json')).profile, 'vendor/ds-profile.json');
  assert.doesNotMatch(r.out, /draft/i);
});

test('ds list and ds lookup', () => {
  const dir = project();
  pk(dir, ['add-ds', '--none']);
  const list = pk(dir, ['ds', 'list']);
  assert.equal(list.code, 0);
  assert.match(list.out, /^\s+Button\s+button\s+· primary, secondary$/m);

  const look = pk(dir, ['ds', 'lookup', 'button']);
  assert.equal(look.code, 0);
  assert.match(look.out, /secondary \[data-variant="secondary"\]/);
  assert.match(look.out, /<button data-variant="secondary" type="button">…<\/button>/);
});

test('ds lookup --json is machine-readable and names the design system', () => {
  const dir = project();
  pk(dir, ['add-ds', '--none']);
  const out = JSON.parse(pk(dir, ['ds', 'lookup', 'Card', '--json']).stdout);
  assert.equal(out.designSystem.name, 'poc-kit neutral kit');
  assert.equal(out.designSystem.reviewed, true);
  assert.deepEqual(out.component.markup, { classes: ['card'] });
  assert.equal(out.component.snippet, '<div class="card">…</div>');
});

test('ds lookup of an unknown component exits 1 and suggests names', () => {
  const dir = project();
  pk(dir, ['add-ds', '--none']);
  const r = pk(dir, ['ds', 'lookup', 'buton']);
  assert.equal(r.code, 1);
  assert.match(r.out, /did you mean: Button/);
});

test('ds without a profile explains what to run', () => {
  const r = pk(mkdtempSync(join(tmpdir(), 'pk-ds-')), ['ds', 'list']);
  assert.equal(r.code, 1);
  assert.match(r.out, /run "poc-kit add-ds" first/);
});

test('add-ds ./local.css drafts a profile, and build warns that it is a draft', () => {
  const dir = project();
  writeFileSync(join(dir, 'brand.css'), CSS);
  const r = pk(dir, ['add-ds', './brand.css']);
  assert.equal(r.code, 0, r.out);
  const p = json(join(dir, 'vendor/ds-profile.json'));
  assert.equal(p.reviewed, false);
  assert.equal(p.name, 'brand');
  assert.equal(p.stylesheet, '../brand.css');
  assert.match(p.generatedBy, /^poc-kit add-ds \d/);
  assert.deepEqual(p.components.map((c) => c.name), ['Btn']);
  assert.match(r.out, /is a draft/);

  const b = pk(dir, ['build']);
  assert.equal(b.code, 0, b.out);
  assert.match(b.out, /DRAFT profile/);
});

test('add-ds --profile with no stylesheet argument fetches the stylesheet the profile names', () => {
  const dir = project();
  const shared = join(dir, 'shared');
  mkdirSync(shared);
  writeFileSync(join(shared, 'brand.css'), CSS);
  writeFileSync(join(shared, 'brand.profile.json'), JSON.stringify({
    profileVersion: '0.1', name: 'Brand', version: '2.0.0', stylesheet: './brand.css', reviewed: true,
    components: [{ name: 'Button', markup: { element: 'button', classes: ['btn'] }, variants: { primary: { classes: ['btn-primary'] } } }],
  }));
  const r = pk(dir, ['add-ds', '--profile', 'shared/brand.profile.json']);
  assert.equal(r.code, 0, r.out);
  assert.equal(readFileSync(join(dir, 'vendor/ds.css'), 'utf8'), CSS);
  assert.equal(json(join(dir, 'vendor/ds-profile.json')).name, 'Brand');

  const b = pk(dir, ['build']);
  assert.match(b.out, /Brand 2\.0\.0: 1 components/);
  assert.doesNotMatch(b.out, /DRAFT/);
});

test('add-ds --profile fails when the profile names a class the stylesheet does not have', () => {
  const dir = project();
  writeFileSync(join(dir, 'brand.css'), CSS);
  writeFileSync(join(dir, 'p.json'), JSON.stringify({
    profileVersion: '0.1', name: 'Brand', reviewed: true,
    components: [{ name: 'Button', markup: { classes: ['button'] } }],
  }));
  const r = pk(dir, ['add-ds', './brand.css', '--profile', 'p.json']);
  assert.equal(r.code, 1);
  assert.match(r.out, /\.button is not in the stylesheet/);
});

test('ds validate reports a broken profile and exits 1', () => {
  const dir = project();
  pk(dir, ['add-ds', '--none']);
  const p = json(join(dir, 'vendor/ds-profile.json'));
  p.components[0].name = 'button';
  writeFileSync(join(dir, 'vendor/ds-profile.json'), JSON.stringify(p));
  const r = pk(dir, ['ds', 'validate']);
  assert.equal(r.code, 1);
  assert.match(r.out, /name must be PascalCase/);
  assert.equal(pk(dir, ['build']).code, 1, 'build must refuse an invalid profile');
});

test('build without a profile warns but still builds', () => {
  const dir = project();
  const r = pk(dir, ['build']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /no design-system profile/);
});
