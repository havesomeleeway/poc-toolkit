import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lintOffline } from '../../src/lint-offline.mjs';

const kinds = (html) => lintOffline(html).violations.map((v) => v.kind);

test('a page with no external references passes', () => {
  const r = lintOffline('<!doctype html><style>a{color:red}</style><script>let x = 1;</script>');
  assert.equal(r.ok, true);
  assert.deepEqual(r.violations, []);
});

test('external <script src> fails, and is reported once per line', () => {
  assert.deepEqual(kinds('<script src="https://cdn.example.com/x.js"></script>'), ['external <script src>']);
});

test('<script src="data:…"> is allowed', () => {
  assert.equal(lintOffline('<script src="data:text/javascript,1"></script>').ok, true);
});

test('external <link> fails; data: <link> is allowed', () => {
  assert.deepEqual(kinds('<link rel="stylesheet" href="https://x.com/a.css">'), ['external <link>']);
  assert.equal(lintOffline('<link rel="icon" href="data:image/png;base64,AAAA">').ok, true);
});

test('@import fails', () => {
  assert.ok(kinds('<style>@import "theme.css";</style>').includes('@import'));
});

test('CSS url(http…) fails', () => {
  assert.ok(kinds('<style>a{background:url(https://x.com/a.png)}</style>').includes('CSS url(http…)'));
});

test('network APIs in script fail', () => {
  assert.ok(kinds('<script>fetch("/api")</script>').includes('network API call'));
  assert.ok(kinds('<script>new XMLHttpRequest()</script>').includes('network API call'));
  assert.ok(kinds('<script>navigator.sendBeacon("/x")</script>').includes('navigator.sendBeacon'));
});

test('URLs inside comments are ignored', () => {
  const html = '<!-- see https://example.com --><style>/* https://example.com */</style>'
    + '<script>// https://example.com\nlet a = 1;</script>';
  assert.equal(lintOffline(html).ok, true);
});

test('w3.org namespace URLs are allowed', () => {
  assert.equal(lintOffline('<svg xmlns="http://www.w3.org/2000/svg"></svg>').ok, true);
});

test('violations carry the correct line number', () => {
  const r = lintOffline('<p>one</p>\n<p>two</p>\n<script src="https://x.com/a.js"></script>');
  assert.equal(r.violations[0].line, 3);
});

test('a citation URL in visible text is not a violation', {
  todo: 'known false positive — see docs/proposals/agent-token-cost-optimizations.md §1.1',
}, () => {
  assert.equal(lintOffline('<p>Source: https://example.com/report</p>').ok, true);
});
