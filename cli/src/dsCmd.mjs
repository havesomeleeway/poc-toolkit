// poc-kit ds list [--json]
// poc-kit ds lookup <Component> [--json]
// poc-kit ds validate [profile.json] [--css vendor/ds.css]
// Look up the design system one component at a time, instead of reading a long report.

import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { parseArgs, readConfig, head, ok, info, warn, fail } from './util.mjs';
import { validateProfile, findComponent, suggest, snippet, describeMarkup } from './ds-profile.mjs';

const USAGE = `poc-kit ds <list | lookup <Component> | validate [file]> [--json]
  list                 Every component in the design-system profile.
  lookup <Component>   One component: markup, variants, states, parts, tokens, docs, snippet.
  validate [file]      Check a profile's shape, and that it matches vendor/ds.css.
  Reads build.config.json "profile" (default vendor/ds-profile.json).`;

export async function run(argv) {
  const args = parseArgs(argv);
  const [sub, ...rest] = args._;
  if (args.help || !sub) { console.log(USAGE); return; }
  if (sub === 'list') return list(args);
  if (sub === 'lookup') return lookup(rest[0], args);
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

function list(args) {
  const p = load(args.profile);
  if (args.json) {
    console.log(JSON.stringify({
      designSystem: designSystem(p),
      components: p.components.map((c) => ({
        name: c.name,
        markup: describeMarkup(c.markup),
        variants: Object.keys(c.variants || {}),
        ...(c.description ? { description: c.description } : {}),
      })),
    }, null, 2));
    return;
  }
  head(`${p.name}${p.version ? ` ${p.version}` : ''} — ${p.components.length} components${p.reviewed ? '' : '  (DRAFT profile)'}`);
  const w = Math.max(...p.components.map((c) => c.name.length), 4);
  for (const c of p.components) {
    const v = Object.keys(c.variants || {});
    info(`${c.name.padEnd(w)}  ${describeMarkup(c.markup)}${v.length ? `  · ${v.join(', ')}` : ''}`);
  }
  if (p.utilities && p.utilities.length) info(`\n  utility classes: ${p.utilities.length} (see the profile)`);
}

function lookup(name, args) {
  if (!name) throw new Error('usage: poc-kit ds lookup <Component>');
  const p = load(args.profile);
  const c = findComponent(p, name);
  if (!c) {
    const near = suggest(p, name);
    fail(`no component "${name}" in ${p.name}`);
    info(near.length ? `did you mean: ${near.join(', ')}` : 'run "poc-kit ds list" to see every component');
    process.exitCode = 1;
    return;
  }
  const examples = [snippet(c), ...Object.entries(c.variants || {})
    .filter(([, m]) => Object.keys(m).length)
    .map(([, m]) => snippet(c, m))];

  if (args.json) {
    console.log(JSON.stringify({ designSystem: designSystem(p), component: { ...c, snippet: c.snippet || examples.join('\n') } }, null, 2));
    return;
  }
  head(`${c.name}  (${p.name}${p.version ? ` ${p.version}` : ''})${p.reviewed ? '' : '  — DRAFT profile, check before relying on it'}`);
  if (c.description) info(c.description);
  if (c.docs) info(`docs      ${c.docs}`);
  info(`markup    ${describeMarkup(c.markup)}`);
  section('variants', c.variants);
  section('states', c.states);
  section('parts', c.parts);
  if (c.tokens && c.tokens.length) info(`tokens    ${c.tokens.join(', ')}`);
  head('example');
  for (const line of (c.snippet || examples.join('\n')).split('\n')) info(line);
}

function section(label, map) {
  const entries = Object.entries(map || {});
  if (!entries.length) return;
  info(`${label.padEnd(10)}${entries.map(([k, m]) => `${k} ${describeMarkup(m)}`).join('\n            ')}`);
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

function rel(p) { return p.replace(process.cwd() + '/', ''); }
