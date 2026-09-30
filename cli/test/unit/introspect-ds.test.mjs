import { test } from 'node:test';
import assert from 'node:assert/strict';
import { introspectDs } from '../../src/introspect-ds.mjs';

const CSS = `
/* .commented-out { color: red } */
:root { --color-primary: #00f; --space-2: 8px; }
.btn { color: var(--color-primary); }
.btn-primary, .btn-secondary:hover { font-family: Inter, sans-serif; }
.card > .card-body { padding: var(--space-2); }
@media (min-width: 768px) { .grid { display: grid; } }
`;

test('counts classes and custom properties', () => {
  const { stats } = introspectDs(CSS);
  // btn, btn-primary, btn-secondary, card, card-body, grid
  assert.equal(stats.classes, 6);
  assert.equal(stats.customProps, 2);
});

test('ignores classes inside comments', () => {
  const { markdown } = introspectDs(CSS);
  assert.ok(!markdown.includes('commented-out'));
});

test('groups classes by prefix', () => {
  const { markdown } = introspectDs(CSS);
  assert.match(markdown, /### `btn` \(2\)/);
  assert.match(markdown, /### `card` \(1\)/);
});

test('lists custom properties, media queries and fonts', () => {
  const { markdown } = introspectDs(CSS);
  assert.match(markdown, /--color-primary/);
  assert.match(markdown, /@media \(min-width: 768px\)/);
  assert.match(markdown, /Inter, sans-serif/);
});

test('records the source', () => {
  assert.match(introspectDs(CSS, { source: 'npm:x@1' }).markdown, /source: `npm:x@1`/);
});

test('an empty stylesheet does not throw', () => {
  const { stats, markdown } = introspectDs('');
  assert.equal(stats.classes, 0);
  assert.match(markdown, /\(none\)/);
});
