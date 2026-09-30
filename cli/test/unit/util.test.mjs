import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs, readConfig, toJson } from '../../src/util.mjs';

test('parseArgs: positionals, --key value, --key=value, --bool', () => {
  assert.deepEqual(
    parseArgs(['a', '--flow', 'f.json', '--props=all', 'b', '--quiet']),
    { _: ['a', 'b'], flow: 'f.json', props: 'all', quiet: true },
  );
});

// The parser has no list of boolean flags, so a boolean flag followed by a positional
// swallows it: `verify --quiet prototype.html` sets quiet="prototype.html". Put
// positionals first, or use --quiet=true.
test('parseArgs: a boolean flag before a positional takes it as its value', () => {
  assert.deepEqual(parseArgs(['--quiet', 'x.html']), { _: [], quiet: 'x.html' });
});

test('parseArgs: a flag followed by another flag is boolean', () => {
  assert.deepEqual(parseArgs(['--none', '--out', 'x.css']), { _: [], none: true, out: 'x.css' });
});

test('parseArgs: --key= gives an empty string', () => {
  assert.deepEqual(parseArgs(['--out=']), { _: [], out: '' });
});

test('readConfig: missing file returns null', () => {
  assert.equal(readConfig(mkdtempSync(join(tmpdir(), 'pk-'))), null);
});

test('readConfig: valid JSON is parsed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pk-'));
  writeFileSync(join(dir, 'build.config.json'), '{"src":"a.html"}');
  assert.deepEqual(readConfig(dir), { src: 'a.html' });
});

test('readConfig: invalid JSON throws a clear error', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pk-'));
  writeFileSync(join(dir, 'build.config.json'), '{nope');
  assert.throws(() => readConfig(dir), /build.config.json is not valid JSON/);
});

test('toJson keeps small objects on one line and round-trips', () => {
  const v = { name: 'x', components: [{ name: 'Button', markup: { element: 'button' } }], long: 'y'.repeat(100) };
  const text = toJson(v);
  assert.deepEqual(JSON.parse(text), v);
  assert.match(text, /^ {2}"components": \[\{"name":"Button","markup":\{"element":"button"\}\}\],$/m);
  assert.ok(text.length < JSON.stringify(v, null, 2).length);
});
