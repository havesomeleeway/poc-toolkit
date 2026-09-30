import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';
import { SCHEMA, TEMPLATES } from '../../src/util.mjs';
import {
  draftProfile, validateProfile, findComponent, suggest, snippet, describeMarkup, profileClasses,
} from '../../src/ds-profile.mjs';

const ajv = new Ajv({ allErrors: true, strict: false });
const schemaValid = ajv.compile(JSON.parse(readFileSync(join(SCHEMA, 'ds-profile.schema.json'), 'utf8')));
const NEUTRAL_CSS = readFileSync(join(TEMPLATES, 'neutral-kit.css'), 'utf8');
const NEUTRAL = JSON.parse(readFileSync(join(TEMPLATES, 'neutral-kit.profile.json'), 'utf8'));
const comp = (p, name) => p.components.find((c) => c.name === name);

// Bootstrap-style: .root, .root-variant, utility classes with !important.
const DASH = `
:root { --x-primary: #0d6efd; --x-radius: .375rem; --x-gap: 1rem; --x-font: "Inter", sans-serif; }
.btn { display: inline-block; padding: 4px; border-radius: var(--x-radius); color: var(--x-primary); }
.btn-primary { color: #fff; background: var(--x-primary); border-color: var(--x-primary); }
.btn-lg { padding: 8px; font-size: 1.25rem; border-radius: 8px; }
.btn:disabled, .btn.is-loading { opacity: .6; pointer-events: none; cursor: default; }
.card { display: flex; border: 1px solid; padding: var(--x-gap); }
.card-body { flex: 1; padding: 1rem; color: inherit; }
.bg-primary { background: blue !important; }
.border-0 { border: 0 !important; }
.text-muted { color: #777 !important; }
`;

// Carbon-style: a shared namespace and BEM.
const BEM = `
.cds--btn { display: inline-flex; padding: 0 1rem; min-height: 3rem; }
.cds--btn--primary { background: #0f62fe; color: #fff; border: 0; }
.cds--btn--sm { min-height: 2rem; padding: 0 .75rem; font-size: .875rem; }
.cds--btn__icon { width: 1rem; height: 1rem; flex-shrink: 0; }
.cds--tag { display: inline-flex; border-radius: 1rem; padding: 0 .5rem; }
.cds--tag--red { background: #ffd7d9; color: #750e13; border: 0; }
`;

// Pico-style: classless, attribute and element-qualified-class variants.
const CLASSLESS = `
button { padding: 8px; border: 1px solid; background: var(--c-primary); }
button[data-variant="secondary"] { background: transparent; }
button:disabled { opacity: .5; }
button.outline, [role="button"].outline { background: none; }
input { padding: 8px; border: 1px solid; }
input[type="checkbox"] { width: 1em; }
input[aria-invalid="true"] { border-color: red; }
:root { --c-primary: #1095c1; }
`;

test('dash style: roots, variants, states, parts; utilities are not components', () => {
  const p = draftProfile(DASH, { name: 'dash' });
  assert.deepEqual(p.components.map((c) => c.name), ['Btn', 'Card']);
  const btn = comp(p, 'Btn');
  assert.deepEqual(btn.markup, { classes: ['btn'] });
  assert.deepEqual(Object.keys(btn.variants), ['lg', 'primary']);
  assert.deepEqual(btn.states.disabled, { attributes: { disabled: '' } });
  assert.deepEqual(btn.states.loading, { classes: ['is-loading'] });
  assert.deepEqual(comp(p, 'Card').parts, { body: { classes: ['card-body'] } });
  assert.deepEqual(p.utilities, ['bg-primary', 'border-0', 'text-muted']);
});

test('dash style: component tokens are the custom properties its rules use', () => {
  const p = draftProfile(DASH);
  assert.deepEqual(comp(p, 'Btn').tokens, ['--x-primary', '--x-radius']);
});

test('BEM with a namespace: the namespace is stripped from names, kept in classes', () => {
  const p = draftProfile(BEM);
  assert.deepEqual(p.components.map((c) => c.name), ['Btn', 'Tag']);
  const btn = comp(p, 'Btn');
  assert.deepEqual(btn.markup, { classes: ['cds--btn'] });
  assert.deepEqual(btn.variants, { primary: { classes: ['cds--btn--primary'] }, sm: { classes: ['cds--btn--sm'] } });
  assert.deepEqual(btn.parts, { icon: { classes: ['cds--btn__icon'] } });
  assert.deepEqual(comp(p, 'Tag').variants, { red: { classes: ['cds--tag--red'] } });
});

test('classless: element components, attribute variants, element-qualified class variants', () => {
  const p = draftProfile(CLASSLESS);
  const button = comp(p, 'Button');
  assert.deepEqual(button.markup, { element: 'button' });
  assert.deepEqual(button.variants, {
    outline: { classes: ['outline'] },
    secondary: { attributes: { 'data-variant': 'secondary' } },
  });
  assert.deepEqual(button.states, { disabled: { attributes: { disabled: '' } } });
  const input = comp(p, 'Input');
  assert.deepEqual(input.variants, { checkbox: { attributes: { type: 'checkbox' } } });
  assert.deepEqual(input.states, { invalid: { attributes: { 'aria-invalid': 'true' } } });
  assert.ok(!comp(p, 'Outline'), '.outline should be a Button variant, not a component');
});

test('tokens are grouped by what their value is', () => {
  assert.deepEqual(draftProfile(DASH).tokens, {
    color: ['--x-primary'],
    fontFamily: ['--x-font'],
    radius: ['--x-radius'],
    space: ['--x-gap'],
  });
});

test('var() fallbacks that are never defined are not listed as tokens', () => {
  const p = draftProfile('.a { color: var(--undefined, red); padding: 1px; margin: 0; }');
  assert.equal(comp(p, 'A').tokens, undefined);
});

test('drafting is deterministic', () => {
  for (const css of [DASH, BEM, CLASSLESS, NEUTRAL_CSS]) {
    assert.equal(JSON.stringify(draftProfile(css)), JSON.stringify(draftProfile(css)));
  }
});

test('every draft validates against its own stylesheet and the JSON schema', () => {
  for (const css of [DASH, BEM, CLASSLESS, NEUTRAL_CSS]) {
    const p = draftProfile(css, { name: 'x', generatedBy: 'test' });
    assert.deepEqual(validateProfile(p, { css }), []);
    assert.ok(schemaValid(p), ajv.errorsText(schemaValid.errors));
    assert.equal(p.reviewed, false);
  }
});

test('the neutral kit profile is reviewed and matches neutral-kit.css', () => {
  assert.equal(NEUTRAL.reviewed, true);
  assert.deepEqual(validateProfile(NEUTRAL, { css: NEUTRAL_CSS }), []);
  assert.ok(schemaValid(NEUTRAL), ajv.errorsText(schemaValid.errors));
});

// Each broken profile must be rejected by both the runtime validator and the JSON schema.
const broken = {
  'missing name': (p) => { delete p.name; },
  'lowercase component name': (p) => { p.components[0].name = 'button'; },
  'duplicate component name': (p) => { p.components[1].name = p.components[0].name; },
  'root markup with nothing in it': (p) => { p.components[0].markup = {}; },
  'unknown markup field': (p) => { p.components[0].markup.tag = 'x'; },
  'unknown component field': (p) => { p.components[0].colour = 'red'; },
  'unknown top-level field': (p) => { p.extra = 1; },
  'reviewed is not a boolean': (p) => { p.reviewed = 'yes'; },
  'token without leading --': (p) => { p.tokens.color = ['nk-bg']; },
  'wrong profileVersion': (p) => { p.profileVersion = '9'; },
};
for (const [label, mutate] of Object.entries(broken)) {
  test(`rejected: ${label}`, () => {
    const p = structuredClone(NEUTRAL);
    mutate(p);
    assert.ok(validateProfile(p).length > 0, 'runtime validator accepted it');
    // the schema can't express unique names; the runtime validator covers that one
    if (label !== 'duplicate component name') assert.equal(schemaValid(p), false, 'schema accepted it');
  });
}

test('rejected against the stylesheet: a class or token the CSS does not have', () => {
  const p = structuredClone(NEUTRAL);
  p.components[1].markup.classes = ['kard'];
  p.tokens.color.push('--nk-missing');
  const problems = validateProfile(p, { css: NEUTRAL_CSS });
  assert.ok(problems.includes('.kard is not in the stylesheet'));
  assert.ok(problems.includes('--nk-missing is not defined in the stylesheet'));
});

test('profileClasses lists every class a profile allows', () => {
  assert.deepEqual(profileClasses(NEUTRAL), ['card', 'muted', 'screen']);
});

test('findComponent is case-insensitive; suggest offers near names', () => {
  assert.equal(findComponent(NEUTRAL, 'textfield').name, 'TextField');
  assert.equal(findComponent(NEUTRAL, 'Nope'), null);
  assert.deepEqual(suggest(NEUTRAL, 'buton'), ['Button']);
  assert.deepEqual(suggest(NEUTRAL, 'text'), ['TextArea', 'TextField']);
});

test('snippet renders markup plus a variant; buttons get type="button"; void elements close', () => {
  const button = findComponent(NEUTRAL, 'Button');
  assert.equal(snippet(button), '<button type="button">…</button>');
  assert.equal(snippet(button, button.variants.secondary), '<button data-variant="secondary" type="button">…</button>');
  assert.equal(snippet(findComponent(NEUTRAL, 'TextField')), '<input type="text">');
  assert.equal(snippet(findComponent(NEUTRAL, 'Card')), '<div class="card">…</div>');
  assert.equal(snippet(findComponent(NEUTRAL, 'Button'), button.states.disabled), '<button disabled type="button">…</button>');
});

test('describeMarkup', () => {
  assert.equal(describeMarkup({ element: 'input', classes: ['a'], attributes: { type: 'text', disabled: '' } }), 'input.a[type="text"][disabled]');
  assert.equal(describeMarkup({}), '(default)');
});
