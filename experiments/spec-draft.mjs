#!/usr/bin/env node
// Throwaway experiment, not part of the CLI. Reads a tagged prototype source and prints one JSON
// file describing what is on each screen. Used to test whether a developer can rebuild the UI
// from it. Usage: node experiments/spec-draft.mjs <prototype.src.html> [flow.json] [--screen <name>] > spec.json
// With --screen only that data-screen is printed, and the flow is left out.
import { readFileSync } from 'node:fs';
import { parseAttrs } from '../cli/src/html-scan.mjs';
import { toJson } from '../cli/src/util.mjs';

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const SKIP = new Set(['script', 'style', 'head', 'title']);
const LAYOUT = { 'pk-wrapper': 'wrapper', 'pk-flow': 'stack', 'pk-cluster': 'row', 'pk-repel': 'row-spread', 'pk-switcher': 'switcher', 'pk-sidebar': 'sidebar', 'pk-grid': 'grid' };

function tree(html) {
  const root = { tag: '#root', attrs: {}, kids: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[4] !== undefined) { stack.at(-1).kids.push(m[4]); continue; }
    if (!m[2]) continue;
    const tag = m[2].toLowerCase();
    if (m[1]) {
      for (let k = stack.length - 1; k > 0; k--) if (stack[k].tag === tag) { stack.length = k; break; }
      continue;
    }
    if (SKIP.has(tag)) { const e = html.toLowerCase().indexOf(`</${tag}`, re.lastIndex); re.lastIndex = e === -1 ? html.length : html.indexOf('>', e) + 1; continue; }
    const el = { tag, attrs: parseAttrs(m[3].replace(/\/\s*$/, '')), kids: [] };
    stack.at(-1).kids.push(el);
    if (!VOID.has(tag) && !/\/\s*$/.test(m[3])) stack.push(el);
  }
  return root;
}

const text = (s) => s.replace(/\s+/g, ' ').trim();

function node(el) {
  const a = el.attrs, out = {};
  const layout = (a.class || '').split(/\s+/).map((c) => LAYOUT[c]).find(Boolean);
  if (a['data-screen']) out.screen = a['data-screen'];
  else if (a['data-component']) out.component = a['data-component'];
  else if (layout) out.layout = layout;
  else out.tag = el.tag;
  if (a['data-id']) out.id = a['data-id'];
  for (const k of ['variant', 'state', 'part', 'feature']) if (a[`data-${k}`]) out[k] = a[`data-${k}`];
  if (a['data-mock']) out.mock = true;
  if (a['data-nav']) out.goesTo = a['data-nav'];
  if ('hidden' in a) out.hidden = true;
  for (const k of ['type', 'value', 'for', 'placeholder']) if (a[k]) out[k] = a[k];
  const own = text(el.kids.filter((k) => typeof k === 'string').join(' '));
  if (own) out.text = own;
  const kids = el.kids.filter((k) => typeof k !== 'string').flatMap(node);
  // a plain wrapper that adds nothing is dropped; its children move up
  if (out.tag === 'div' && !out.id && !out.text && !out.feature && !out.hidden) return kids;
  if (kids.length) out.children = kids;
  return [out];
}

const argv = process.argv.slice(2);
const at = argv.indexOf('--screen');
const only = at === -1 ? null : argv.splice(at, 2)[1];
const [src, flowFile] = argv;
if (!src) { console.error('usage: spec-draft.mjs <prototype.src.html> [flow.json]'); process.exit(1); }
const html = readFileSync(src, 'utf8');
const doc = tree(html);
const find = (el, tag) => el.kids.filter((k) => typeof k !== 'string').flatMap((k) => (k.tag === tag ? [k] : find(k, tag)));
const body = find(doc, 'body')[0] || doc;
const features = JSON.parse((/<script[^>]*id="poc-features"[^>]*>([\s\S]*?)<\/script>/.exec(html) || [, '[]'])[1]);
const pick = (list) => list.flatMap((n) => (n.screen === only ? [n] : pick(n.children || [])));
let screens = body.kids.filter((k) => typeof k !== 'string').flatMap(node);
if (only) { screens = pick(screens); if (!screens.length) { console.error(`no data-screen="${only}" found`); process.exit(1); } }
const out = { screens, features };
if (flowFile && !only) out.flow = JSON.parse(readFileSync(flowFile, 'utf8')).steps;
console.log(toJson(out, 110));
