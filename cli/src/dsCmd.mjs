// poc-kit ds list [--detail] [--json]
// poc-kit ds lookup <Component> [--tokens] [--json]
// poc-kit ds search <text> [--all] [--json]
// poc-kit ds validate [profile.json] [--css vendor/ds.css]
// Look up the design system one component at a time, instead of reading a long report.

import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { parseArgs, rel, readConfig, head, ok, info, warn, fail } from './util.mjs';
import { validateProfile, findComponent, suggest, snippet, describeMarkup, profileClasses, profileTokens } from './ds-profile.mjs';

const USAGE = `poc-kit ds <list | lookup <Component> | search <text> | validate [file]> [--json]
  list [--detail]              Component names (--detail: markup and variants too).
  lookup <Component> [--tokens] One component: markup, variants, states, parts, docs, example.
  search <text> [--all]         Components, classes and tokens whose name contains <text>.
  validate [file]               Check a profile's shape, and that it matches vendor/ds.css.
  Reads build.config.json "profile" (default vendor/ds-profile.json).`;

const SEARCH_LIMIT = 20;

export async function run(argv) {
  const args = parseArgs(argv);
  const [sub, ...rest] = args._;
  if (args.help || !sub) { console.log(USAGE); return; }
  if (sub === 'list') return list(args);
  if (sub === 'lookup') return lookup(rest[0], args);
  if (sub === 'search') return search(rest.join(' '), args);
  if (sub === 'validate') return validate(rest[0], args);
  throw new Error(`unknown subcommand "${sub}"\n\n${USAGE}`);
}
function profilePath(explicit) {
  const cfg = readConfig();
  return resolve(process.cwd(), explicit || (cfg && cfg.profile) || 'vendor/ds-profile.json');
}

function load(explicit) {
  const p = profilePath(explicit);
  if (!existsSync(p)) throw new Error(`no design-system profile at ${rel(p)} (run "poc-kit add-ds" first)`);
  let profile;
  try { profile = JSON.parse(readFileSync(p, 'utf8')); } catch (e) { throw new Error(`${rel(p)} is not valid JSON: ${e.message}`); }
  const problems = validateProfile(profile);
  if (problems.length) throw new Error(`${rel(p)} is not a valid profile:\n  - ${problems.join('\n  - ')}\n(run "poc-kit ds validate")`);
  return profile;
}

function designSystem(p) {
  const out = { name: p.name, reviewed: p.reviewed };
  for (const k of ['version', 'docs', 'stylesheet']) if (p[k]) out[k] = p[k];
  return out;
}

function title(p) {
  return `${p.name}${p.version ? ` ${p.version}` : ''}${p.reviewed ? '' : ' (DRAFT profile)'}`;
}

function list(args) {
  const p = load(args.profile);
  if (args.json) {
    console.log(JSON.stringify({
      designSystem: designSystem(p),
      components: p.components.map((c) => (args.detail
        ? { name: c.name, markup: describeMarkup(c.markup), variants: Object.keys(c.variants || {}) }
        : c.name)),
    }));
    return;
  }
  head(`${title(p)} — ${p.components.length} components`);
  if (!args.detail) {
    for (const line of wrap(p.components.map((c) => c.name), ', ', 96)) info(line);
    return;
  }
  const w = Math.max(...p.components.map((c) => c.name.length), 4);
  for (const c of p.components) {
    const v = Object.keys(c.variants || {});
    info(`${c.name.padEnd(w)}  ${describeMarkup(c.markup)}${v.length ? `  · ${v.join(', ')}` : ''}`);
  }
}

function lookup(name, args) {
  if (!name) throw new Error('usage: poc-kit ds lookup <Component>');
  const p = load(args.profile);
  const c = findComponent(p, name);
  if (!c) {
    const near = suggest(p, name);
    fail(`no component "${name}" in ${p.name}${near.length ? ` — did you mean: ${near.join(', ')}` : ' — see poc-kit ds list'}`);
    process.exitCode = 1;
    return;
  }
  const example = c.snippet || snippet(c);
  if (args.json) {
    const { tokens, ...rest } = c;
    console.log(JSON.stringify({ designSystem: designSystem(p), component: { ...rest, ...(args.tokens && tokens ? { tokens } : {}), snippet: example } }));
    return;
  }
  head(`${c.name}  (${title(p)})`);
  if (c.description) info(c.description);
  if (c.docs) info(`docs      ${c.docs}`);
  info(`markup    ${describeMarkup(c.markup)}`);
  section('variants', c.variants);
  section('states', c.states);
  section('parts', c.parts);
  if (args.tokens && c.tokens && c.tokens.length) info(`tokens    ${c.tokens.join(', ')}`);
  info(`example   ${example.split('\n').join('\n          ')}`);
}

function section(label, map) {
  const entries = Object.entries(map || {});
  if (!entries.length) return;
  info(`${label.padEnd(10)}${entries.map(([k, m]) => `${k} ${describeMarkup(m)}`).join('\n            ')}`);
}

// Components, classes and tokens whose name contains the text. Classes and tokens come from the
// profile, or from the stylesheet when the profile allows "all" of them.
function search(text, args) {
  if (!text) throw new Error('usage: poc-kit ds search <text>');
  const p = load(args.profile);
  const cssPath = resolve(process.cwd(), 'vendor/ds.css');
  const css = existsSync(cssPath) ? readFileSync(cssPath, 'utf8') : undefined;
  const q = text.toLowerCase();
  const has = (x) => x.toLowerCase().includes(q);

  const owner = new Map();
  for (const c of p.components) {
    for (const [kind, map] of [['', { '': c.markup }], ['variant', c.variants], ['state', c.states], ['part', c.parts]]) {
      for (const [k, m] of Object.entries(map || {})) for (const cls of (m && m.classes) || []) owner.set(cls, kind ? `${c.name} ${kind} ${k}` : c.name);
    }
  }
  const found = {
    components: p.components.map((c) => c.name).filter(has),
    classes: profileClasses(p, css).filter(has),
    tokens: profileTokens(p, css).filter(has),
  };
  if (args.json) { console.log(JSON.stringify(found)); return; }

  const total = found.components.length + found.classes.length + found.tokens.length;
  if (!total) { info(`nothing in ${p.name} matches "${text}"`); process.exitCode = 1; return; }
  const show = (label, items, fmt = (x) => x) => {
    if (!items.length) return;
    const shown = args.all ? items : items.slice(0, SEARCH_LIMIT);
    const more = items.length - shown.length;
    info(`${label} (${items.length}): ${shown.map(fmt).join(', ')}${more ? ` … and ${more} more (--all)` : ''}`);
  };
  show('components', found.components);
  show('classes', found.classes, (c) => (owner.has(c) ? `.${c} [${owner.get(c)}]` : `.${c}`));
  show('tokens', found.tokens);
}

function wrap(items, sep, width) {
  const lines = [];
  let cur = '';
  for (const it of items) {
    const next = cur ? cur + sep + it : it;
    if (next.length > width && cur) { lines.push(cur + sep.trimEnd()); cur = it; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

function validate(file, args) {
  const p = profilePath(file);
  if (!existsSync(p)) throw new Error(`no profile at ${rel(p)}`);
  let profile;
  try { profile = JSON.parse(readFileSync(p, 'utf8')); } catch (e) { throw new Error(`${rel(p)} is not valid JSON: ${e.message}`); }
  const cssPath = resolve(process.cwd(), typeof args.css === 'string' ? args.css : 'vendor/ds.css');
  const css = existsSync(cssPath) ? readFileSync(cssPath, 'utf8') : undefined;

  head(`validate  ${rel(p)}${css !== undefined ? `  against ${rel(cssPath)}` : ''}`);
  const problems = validateProfile(profile, { css });
  if (problems.length) {
    for (const x of problems) fail(x);
    process.exitCode = 1;
    return;
  }
  ok(`${profile.components.length} components, valid`);
  if (css === undefined) warn(`no stylesheet at ${rel(cssPath)} — classes and tokens were not checked (pass --css)`);
  if (!profile.reviewed) warn('"reviewed" is false — this is still a draft');
}

