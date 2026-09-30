// add-ds profiles and the `ds` command, run as real processes. No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pk, tmp } from '../helpers.mjs';

const json = (p) => JSON.parse(readFileSync(p, 'utf8'));

const CSS = `
:root { --t-accent: #06c; }
.btn { display: inline-block; padding: 4px 8px; color: var(--t-accent); }
.btn-primary { background: var(--t-accent); color: #fff; border: 0; }
`;

function project() {
  const dir = tmp();
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
  assert.match(list.out, /^ {2}Button, Card, Label, Link, Select, Table, TextArea, TextField$/m, 'names only by default');
  assert.match(pk(dir, ['ds', 'list', '--detail']).out, /^\s+Button\s+button\s+· primary, secondary$/m);

  const look = pk(dir, ['ds', 'lookup', 'button']);
  assert.equal(look.code, 0);
  assert.match(look.out, /secondary \[data-variant="secondary"\]/);
  assert.match(look.out, /example {3}<button type="button">…<\/button>$/m, 'one example line');
  assert.doesNotMatch(look.out, /tokens/);
  assert.match(pk(dir, ['ds', 'lookup', 'button', '--tokens']).out, /tokens {4}--nk-accent/);
});

test('ds lookup --json is machine-readable and names the design system', () => {
  const dir = project();
  pk(dir, ['add-ds', '--none']);
  const out = JSON.parse(pk(dir, ['ds', 'lookup', 'Card', '--json']).stdout);
  assert.equal(out.designSystem.name, 'poc-kit neutral kit');
  assert.equal(out.designSystem.reviewed, true);
  assert.deepEqual(out.component.markup, { classes: ['card'] });
  assert.equal(out.component.snippet, '<div class="card">…</div>');
  assert.equal(out.component.tokens, undefined, 'tokens only with --tokens');
});

test('ds lookup of an unknown component exits 1 and suggests names', () => {
  const dir = project();
  pk(dir, ['add-ds', '--none']);
  const r = pk(dir, ['ds', 'lookup', 'buton']);
  assert.equal(r.code, 1);
  assert.match(r.out, /did you mean: Button/);
});

test('ds search finds components, classes (with their owner) and tokens, capped', () => {
  const dir = project();
  pk(dir, ['add-ds', '--none']);
  const r = pk(dir, ['ds', 'search', 'card']);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /components \(1\): Card/);
  assert.match(r.out, /classes \(1\): \.card \[Card\]/);
  assert.match(pk(dir, ['ds', 'search', 'accent']).out, /tokens \(2\): --nk-accent, --nk-accent-fg/);
  assert.equal(pk(dir, ['ds', 'search', 'zzz']).code, 1);
});

test('ds search reads classes from the stylesheet when a draft allows "all"', () => {
  const dir = project();
  writeFileSync(join(dir, 'brand.css'), CSS + '.u-1 { margin: 0 } .u-2 { margin: 0 }');
  pk(dir, ['add-ds', './brand.css']);
  assert.match(pk(dir, ['ds', 'search', 'u-']).out, /classes \(2\): \.u-1, \.u-2/);
});

test('ds without a profile explains what to run', () => {
  const r = pk(tmp(), ['ds', 'list']);
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
  assert.match(r.out, /draft profile/);
  assert.equal(p.utilities, 'all');
  assert.equal(p.tokens, 'all');

  // The scaffold's placeholder buttons say data-component="Button"; this design system calls it Btn.
  const b = pk(dir, ['build']);
  assert.match(b.out, /DRAFT profile/);
  assert.equal(b.code, 1);
  assert.match(b.out, /"Button" is not in brand/);
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
