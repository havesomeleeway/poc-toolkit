// Templates must validate against the schemas that ship with them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv from 'ajv';
import { SCHEMA, TEMPLATES } from '../../src/util.mjs';

const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
const ajv = new Ajv({ allErrors: true, strict: false });
const validateFlow = ajv.compile(json(join(SCHEMA, 'flow.schema.json')));

test('templates/flow.json validates against flow.schema.json', () => {
  const valid = validateFlow(json(join(TEMPLATES, 'flow.json')));
  assert.ok(valid, ajv.errorsText(validateFlow.errors));
});

test('flow.schema.json rejects an unknown step type', () => {
  assert.equal(validateFlow({ url: 'x.html', steps: [{ tap: '#a' }] }), false);
});

test('flow.schema.json rejects a flow without steps', () => {
  assert.equal(validateFlow({ url: 'x.html' }), false);
});
