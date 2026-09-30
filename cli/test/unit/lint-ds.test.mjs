// Every rule has at least one example that must pass and one that must fail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TEMPLATES } from '../../src/util.mjs';
import { classSet } from '../../src/css-scan.mjs';
import { lintDs, validateAllow, RULES } from '../../src/lint-ds.mjs';
import { scanHtml } from '../../src/html-scan.mjs';

const profile = JSON.parse(readFileSync(join(TEMPLATES, 'neutral-kit.profile.json'), 'utf8'));
const layoutClasses = [...classSet(readFileSync(join(TEMPLATES, 'layout.css'), 'utf8'))];
const FIXTURE = join(TEMPLATES, '..', 'test', 'fixtures', 'sample', 'prototype.src.html');

const page = (body, head = '') => `<!doctype html><html><head>${head}</head><body>\n${body}\n</body></html>`;
const lint = (body, opts = {}) => lintDs(page(body, opts.head), { profile, layoutClasses, ...opts });
const rulesOf = (r) => r.violations.map((v) => v.rule);
const passes = (body, opts) => { const r = lint(body, opts); assert.deepEqual(r.violations, [], JSON.stringify(r.violations, null, 1)); };
const failsWith = (body, rule, opts) => { const r = lint(body, opts); assert.ok(rulesOf(r).includes(rule), `expected ${rule}, got ${JSON.stringify(rulesOf(r))}`); return r; };

test('the sample prototype passes', () => {
  const r = lintDs(readFileSync(FIXTURE, 'utf8'), { profile, layoutClasses });
  assert.deepEqual(r.violations, []);
  assert.deepEqual(r.stats, { components: 10, screens: 2, features: 2 });
});

test('the init scaffold passes with the neutral kit', () => {
  const r = lintDs(readFileSync(join(TEMPLATES, 'prototype.src.html'), 'utf8'), { profile, layoutClasses });
  assert.deepEqual(r.violations, []);
});

test('unknown-class', () => {
  passes('<div class="card pk-flow muted" data-component="Card" data-id="a"></div>');
  const r = failsWith('<div class="hero-banner"></div><p class="hero-banner"></p>', 'unknown-class');
  assert.equal(r.violations.length, 1, 'one report per class, not per use');
  assert.match(r.violations[0].message, /2×/);
});

test('unknown-component, with a suggestion', () => {
  const r = failsWith('<button data-component="Buton" data-id="a"></button>', 'unknown-component');
  assert.match(r.violations[0].message, /did you mean Button/);
});

test('unknown-variant and unknown-state', () => {
  passes('<button data-component="Button" data-id="a" data-variant="secondary" data-state="disabled" disabled></button>');
  failsWith('<button data-component="Button" data-id="a" data-variant="danger"></button>', 'unknown-variant');
  failsWith('<button data-component="Button" data-id="a" data-state="loading"></button>', 'unknown-state');
});

test('markup-mismatch: wrong element, missing class, missing or wrong attribute', () => {
  failsWith('<a data-component="Button" data-id="a"></a>', 'markup-mismatch');
  failsWith('<div data-component="Card" data-id="a"></div>', 'markup-mismatch');
  failsWith('<button data-component="Button" data-id="a" data-state="disabled"></button>', 'markup-mismatch');
  failsWith('<input data-component="TextField" data-id="a" type="number">', 'markup-mismatch');
  // a variant can change an attribute the root sets
  passes('<input data-component="TextField" data-id="a" data-variant="number" type="number">');
});

test('markup-mismatch: a class from a variant the element does not declare', () => {
  const p = structuredClone(profile);
  p.components.find((c) => c.name === 'Card').variants = { flat: { classes: ['muted'] } };
  const r = lintDs(page('<div class="card muted" data-component="Card" data-id="a"></div>'), { profile: p, layoutClasses });
  assert.deepEqual(rulesOf(r), ['markup-mismatch']);
  assert.match(r.violations[0].message, /variant "flat"/);
});

test('data-part: known part inside its component passes; otherwise unknown-part / part-outside-component', () => {
  const p = structuredClone(profile);
  p.components.find((c) => c.name === 'Card').parts = { body: { classes: ['muted'] } };
  const opts = { profile: p, layoutClasses };
  assert.deepEqual(lintDs(page('<div class="card" data-component="Card" data-id="a"><p class="muted" data-part="body"></p></div>'), opts).violations, []);
  assert.deepEqual(rulesOf(lintDs(page('<div class="card" data-component="Card" data-id="a"><p data-part="footer"></p></div>'), opts)), ['unknown-part']);
  assert.deepEqual(rulesOf(lintDs(page('<p class="muted" data-part="body"></p>'), opts)), ['part-outside-component']);
  assert.deepEqual(rulesOf(lintDs(page('<div class="card" data-component="Card" data-id="a"><p data-part="body"></p></div>'), opts)), ['markup-mismatch']);
});

test('untagged-widget: looks like a profile component, or is a native control', () => {
  failsWith('<button type="button">Go</button>', 'untagged-widget');
  failsWith('<div class="card"></div>', 'untagged-widget');
  const r = failsWith('<input type="checkbox">', 'untagged-widget');
  assert.match(r.violations[0].message, /TextField/, 'an untagged <input> is reported against the closest component');
  failsWith('<div role="button">x</div>', 'untagged-widget');
  passes('<input type="hidden" name="x">');
});

test('missing-id, bad-id, duplicate-id', () => {
  failsWith('<button data-component="Button"></button>', 'missing-id');
  failsWith('<button data-component="Button" data-id="Pay Now"></button>', 'bad-id');
  const r = failsWith('<button data-component="Button" data-id="a"></button>\n<button data-component="Button" data-id="a"></button>', 'duplicate-id');
  assert.match(r.violations[0].message, /also used on line 2/);
});

test('screen-untagged and duplicate screens', () => {
  passes('<section class="screen" data-screen="one"></section><section class="screen" data-screen="two"></section>');
  failsWith('<section class="screen" id="one"></section>', 'screen-untagged');
  failsWith('<section class="screen" data-screen="one"></section><section class="screen" data-screen="one"></section>', 'duplicate-id');
});

test('inline-style: hard-coded visual values and token overrides fail', () => {
  passes('<div class="pk-cluster" style="--pk-gutter: var(--nk-space); display: flex; max-width: 40rem"></div>');
  const r = failsWith('<div style="padding: 12px"></div>', 'inline-style');
  assert.match(r.violations[0].message, /padding: 12px/, 'the message shows the value');
  failsWith('<div style="font-size: 20px"></div>', 'inline-style');
  failsWith('<div style="--nk-accent: var(--nk-fg)"></div>', 'inline-style');
  failsWith('<div style="color: var(--not-a-token)"></div>', 'inline-style');
  failsWith('<div style="margin: calc(var(--nk-space) * 2)"></div>', 'inline-style');
});

test('inline-style: local custom properties and token-only values pass', () => {
  passes('<div style="--d: 40%; --pct: 0.42"></div>');
  passes('<span style="color: var(--nk-accent); border-color: var(--nk-border); background: transparent"></span>');
  passes('<p style="margin-top: var(--nk-space)"></p>');
  passes('<p style="margin: 0"></p>');
});

test('raw-color: in style="" and in the page\'s own <style>; build markers are ignored', () => {
  failsWith('<div style="color: #c00"></div>', 'raw-color');
  failsWith('<div style="background: rgb(0 0 0)"></div>', 'raw-color');
  failsWith('<p></p>', 'raw-color', { head: '<style>.x { color: red; }</style>' });
  passes('<p></p>', { head: '<style>/*__DS_CSS__*/</style><style>[hidden] { display: none !important; } a { color: var(--nk-accent); }</style>' });
});

test('features: declared and used passes; unknown, unused and malformed fail', () => {
  const block = (json) => `<script type="application/json" id="poc-features">${json}</script>`;
  passes(`<div data-feature="export"></div>${block('[{"id":"export","title":"Export","source":"REQ-1"}]')}`);
  failsWith('<div data-feature="export"></div>', 'unknown-feature');
  failsWith(block('[{"id":"export","title":"Export"}]'), 'unused-feature');
  failsWith(block('{not json'), 'bad-features-block');
  failsWith(block('[{"id":"export"}]'), 'bad-features-block');
  failsWith(`<div data-feature="Export"></div>${block('[{"id":"Export","title":"Export"}]')}`, 'bad-id');
});

test('allow: a matching entry moves the violation to "allowed"; a stale entry is reported', () => {
  const allow = [
    { rule: 'unknown-class', target: 'hero', reason: 'marketing banner, not in the DS yet' },
    { rule: 'raw-color', target: 'nothing-here', reason: 'stale' },
  ];
  const r = lint('<div class="hero"></div>', { allow });
  assert.equal(r.ok, true);
  assert.deepEqual(r.allowed.map((a) => [a.rule, a.target, a.reason]), [['unknown-class', 'hero', 'marketing banner, not in the DS yet']]);
  assert.deepEqual(r.unusedAllow.map((a) => a.target), ['nothing-here']);
});

test('validateAllow requires a known rule, a target and a reason', () => {
  assert.deepEqual(validateAllow(undefined), []);
  assert.deepEqual(validateAllow([{ rule: 'unknown-class', target: 'x', reason: 'why' }]), []);
  assert.equal(validateAllow([{ rule: 'nope', target: 'x', reason: 'why' }]).length, 1);
  assert.match(validateAllow([{ rule: 'unknown-class', target: 'x' }])[0], /reason is required/);
  assert.match(validateAllow({})[0], /must be a list/);
});

test('every rule is covered by a test above', () => {
  const src = readFileSync(new URL(import.meta.url), 'utf8');
  for (const rule of Object.keys(RULES)) assert.ok(src.includes(`'${rule}'`), `no test for ${rule}`);
});

test('scanHtml: attributes, nesting across unclosed tags, raw blocks, line numbers', () => {
  const { elements, styles, scripts } = scanHtml('<div a="1" b=\'x>y\' c=z d>\n<p>one<p>two</div>\n<style>.a{}</style><script id="s">if (a<b) {}</script><!-- <button> -->');
  assert.deepEqual(elements[0].attrs, { a: '1', b: 'x>y', c: 'z', d: '' });
  assert.equal(elements[1].parent, 0);
  assert.equal(elements[1].line, 2);
  assert.equal(elements[3].parent, -1, '</div> closes the unclosed <p>s too');
  assert.equal(styles[0].text, '.a{}');
  assert.equal(scripts[0].text, 'if (a<b) {}');
  assert.ok(!elements.some((e) => e.tag === 'button'), 'commented-out markup is ignored');
});
