// Size budgets for what agents read. Tokens are estimated as characters ÷ 4.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { draftProfile } from '../../src/ds-profile.mjs';
import { pk, tmp, tokens } from '../helpers.mjs';

function project() {
  const dir = tmp();
  pk(dir, ['init', '.']);
  pk(dir, ['add-ds', '--none']);
  return dir;
}

test('build output for a page with ~350 problems stays under 1,500 tokens', () => {
  const dir = project();
  const body = [
    ...Array.from({ length: 150 }, (_, i) => `<div class="made-up-${i} also-${i % 7}">x</div>`),
    ...Array.from({ length: 60 }, (_, i) => `<p style="margin-top: ${i}px; color: #${String(i).padStart(3, '0')}">y</p>`),
    ...Array.from({ length: 50 }, () => '<button type="button">Go</button>'),
    ...Array.from({ length: 7 }, (_, i) => `<section class="screen" id="s${i}"></section>`),
  ].join('\n');
  const src = join(dir, 'prototype.src.html');
  writeFileSync(src, readFileSync(src, 'utf8').replace('</main>', `${body}\n</main>`));

  const r = pk(dir, ['build']);
  assert.equal(r.code, 1);
  assert.ok(tokens(r.out) <= 1500, `build printed ~${tokens(r.out)} tokens:\n${r.out}`);
  for (const rule of ['unknown-class', 'inline-style', 'raw-color', 'untagged-widget', 'screen-untagged']) {
    assert.match(r.out, new RegExp(`FAIL  ${rule} \\(\\d+\\)`), `no summary for ${rule}`);
  }
  assert.match(r.out, /… and \d+ more \(--all\)/);
  assert.ok(tokens(pk(dir, ['build', '--all']).out) > tokens(r.out), '--all prints everything');
});

test('a draft profile does not grow with the number of utility classes or tokens', () => {
  const component = '.card { display: block; padding: 1rem; border: 1px solid; } .card-body { padding: 1rem; margin: 0; color: inherit; }';
  const utilities = Array.from({ length: 2000 }, (_, i) => `.u-${i} { margin: ${i}px !important; }`).join('\n');
  const vars = `:root { ${Array.from({ length: 1000 }, (_, i) => `--t-${i}: ${i}px;`).join(' ')} }`;
  const small = JSON.stringify(draftProfile(component));
  const large = JSON.stringify(draftProfile(`${component}\n${utilities}\n${vars}`));
  assert.ok(large.length - small.length < 100, `grew by ${large.length - small.length} characters`);
});

test('ds lookup of a component with 20 variants stays under 300 tokens', () => {
  const dir = tmp();
  pk(dir, ['init', '.']);
  const variants = Array.from({ length: 20 }, (_, i) => `.btn-v${i} { color: inherit; padding: ${i}px; margin: 0; }`).join('\n');
  writeFileSync(join(dir, 'x.css'), `.btn { display: inline-block; padding: 4px; margin: 0; }\n${variants}`);
  pk(dir, ['add-ds', './x.css']);
  const r = pk(dir, ['ds', 'lookup', 'Btn']);
  assert.equal(r.code, 0, r.out);
  assert.ok(tokens(r.out) <= 300, `lookup printed ~${tokens(r.out)} tokens:\n${r.out}`);
});
