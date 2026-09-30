// poc-kit add-ds <npm-name | https://…/x.css | ./x.css | --none> [--profile <path | url>]
//                [--name "Design System"] [--out vendor/ds.css]
// Acquire a design-system stylesheet for offline use and write its profile:
// either a shared, reviewed profile (--profile) or a draft generated from the CSS.

import { resolve, dirname, basename, relative, isAbsolute } from 'node:path';
import { mkdirSync, writeFileSync, copyFileSync, readFileSync, existsSync } from 'node:fs';
import { parseArgs, readConfig, rel, fetchUrl, toJson, TEMPLATES, PKG_ROOT, head, ok, info, warn, fail } from './util.mjs';
import { classSet, customProps } from './css-scan.mjs';
import { draftProfile, validateProfile, profileClasses } from './ds-profile.mjs';

const NEUTRAL = 'poc-kit:neutral-kit.css';
const USAGE = 'poc-kit add-ds <npm-name | https://…/x.css | ./x.css | --none> [--profile <path | url>] [--name "Name"] [--out vendor/ds.css]\n'
  + '  Downloads the stylesheet into vendor/ and writes vendor/ds-profile.json.\n'
  + '  --profile  use a shared, reviewed profile instead of drafting one. With no stylesheet argument,\n'
  + '             the stylesheet named in the profile is fetched, so both always match.';

export async function run(argv) {
  const args = parseArgs(argv);
  if (args.help || (args._.length === 0 && !args.none && !args.profile)) {
    console.log(USAGE);
    return;
  }
  const outCss = resolve(process.cwd(), args.out || 'vendor/ds.css');
  const outDir = dirname(outCss);
  const outProfile = resolve(outDir, 'ds-profile.json');
  mkdirSync(outDir, { recursive: true });

  head('add-ds');

  let shared = null;
  if (args.profile) {
    shared = await loadProfile(args.profile);
    ok(`profile ${shared.profile.name}${shared.profile.version ? ` ${shared.profile.version}` : ''} <- ${args.profile}`);
  }

  let spec = args.none ? NEUTRAL : args._[0];
  if (!spec && shared) {
    spec = shared.profile.stylesheet;
    if (!spec) throw new Error('the profile has no "stylesheet" — pass the stylesheet as well: add-ds <npm | url | ./x.css> --profile …');
    if (shared.dir && isLocalPath(spec) && !isAbsolute(spec)) spec = resolve(shared.dir, spec);
  }

  // --- stylesheet -------------------------------------------------------------------------------
  let css, source, meta;
  if (spec === NEUTRAL) {
    copyFileSync(resolve(TEMPLATES, 'neutral-kit.css'), outCss);
    css = readFileSync(outCss, 'utf8');
    source = 'neutral-kit (no design system)';
    meta = { name: 'poc-kit neutral kit', stylesheet: NEUTRAL };
    ok(`neutral kit -> ${rel(outCss)}`);
  } else if (/^https?:\/\//.test(spec)) {
    css = await fetchText(spec);
    writeFileSync(outCss, css);
    source = spec;
    meta = { name: basename(new URL(spec).pathname).replace(/(\.min)?\.css$/, '') || new URL(spec).hostname, stylesheet: spec };
    ok(`${bytes(css)} from URL -> ${rel(outCss)}`);
  } else if (isLocalPath(spec)) {
    const from = resolve(process.cwd(), spec);
    if (!existsSync(from)) throw new Error(`no such file: ${spec}`);
    css = readFileSync(from, 'utf8');
    writeFileSync(outCss, css);
    source = rel(from);
    meta = { name: basename(from).replace(/(\.min)?\.css$/, ''), stylesheet: relative(outDir, from) };
    ok(`${bytes(css)} from ${source} -> ${rel(outCss)}`);
  } else {
    const resolved = await resolveNpmCss(spec);
    css = await fetchText(resolved.url);
    writeFileSync(outCss, css);
    source = `npm:${resolved.pkg}@${resolved.version}/${resolved.file}`;
    meta = { name: resolved.pkg, version: resolved.version, stylesheet: `${resolved.pkg}@${resolved.version}/${resolved.file}` };
    ok(`${bytes(css)} from ${source} -> ${rel(outCss)}`);
  }

  const classCount = classSet(css).size;
  ok(`${classCount} classes, ${customProps(css).size} custom properties`);

  // --- profile ------------------------------------------------------------------------------------
  let profile;
  if (shared) {
    profile = shared.profile;
    const problems = validateProfile(profile, { css });
    if (problems.length) {
      for (const p of problems) fail(p);
      throw new Error(`the profile does not match this stylesheet (${problems.length} problem(s)) — fix the profile or fetch the stylesheet it describes`);
    }
    if (profile.version && meta.version && profile.version !== meta.version) {
      warn(`profile describes ${profile.name} ${profile.version}, but ${meta.version} was fetched`);
    }
    if (args._[0] && profile.stylesheet && profile.stylesheet !== meta.stylesheet && !args.none) {
      warn(`profile names stylesheet "${profile.stylesheet}", but "${meta.stylesheet}" was fetched`);
    }
  } else if (spec === NEUTRAL) {
    profile = JSON.parse(readFileSync(resolve(TEMPLATES, 'neutral-kit.profile.json'), 'utf8'));
  } else {
    const version = JSON.parse(readFileSync(resolve(PKG_ROOT, 'package.json'), 'utf8')).version;
    profile = draftProfile(css, {
      name: typeof args.name === 'string' ? args.name : meta.name,
      version: meta.version,
      stylesheet: meta.stylesheet,
      generatedBy: `poc-kit add-ds ${version}`,
    });
  }
  writeFileSync(outProfile, toJson(profile) + '\n');
  ok(`profile: ${profile.components.length} components${profile.reviewed ? '' : ' (DRAFT)'} -> ${rel(outProfile)}`);

  const cfgPath = resolve(process.cwd(), 'build.config.json');
  const cfg = readConfig();
  if (cfg) {
    cfg.profile = relative(process.cwd(), outProfile);
    writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
  }

  // Utility-first design systems (Tailwind-based, e.g. component libraries shipped as React) keep
  // their components in code, not in the CSS, so a draft can't find them.
  const componentClasses = profileClasses({ ...profile, utilities: [] }).length;
  if (!shared && spec !== NEUTRAL && classCount >= 200 && 1 - componentClasses / classCount > 0.9) {
    warn('almost all utility classes (Tailwind-style): the components live in the component library, not');
    info('      the CSS, so the draft can\'t find them. Write the profile from the library\'s docs or source.');
  }
  if (!profile.reviewed) {
    warn('draft profile: review it once (names, variants, states, parts, docs links), set "reviewed": true,');
    info('      share it, and next time use add-ds --profile <file | URL>.');
  }
  info('next: poc-kit ds list · poc-kit ds lookup <Component> · poc-kit ds search <text>');
}

async function loadProfile(where) {
  let text, dir = null;
  if (/^https?:\/\//.test(where)) {
    text = await fetchText(where, 'application/json,*/*');
  } else {
    const p = resolve(process.cwd(), where);
    if (!existsSync(p)) throw new Error(`no such profile: ${where}`);
    text = readFileSync(p, 'utf8');
    dir = dirname(p);
  }
  let profile;
  try { profile = JSON.parse(text); } catch (e) { throw new Error(`profile is not valid JSON: ${e.message}`); }
  const problems = validateProfile(profile);
  if (problems.length) {
    for (const p of problems) fail(p);
    throw new Error(`invalid profile (${problems.length} problem(s))`);
  }
  return { profile, dir };
}

function isLocalPath(s) {
  return s.startsWith('.') || s.startsWith('/') || /^[A-Za-z]:[\\/]/.test(s) || (s.endsWith('.css') && existsSync(resolve(process.cwd(), s)));
}

function bytes(s) { return `${(Buffer.byteLength(s) / 1024).toFixed(1)} KB`; }

const fetchText = (url, accept = 'text/css,*/*') => fetchUrl(url, { accept });

// Resolve "pkg", "pkg@1.2.3", "@scope/pkg", "@scope/pkg@1/dist/x.css" to a jsDelivr URL.
async function resolveNpmCss(spec) {
  let rest = spec;
  let scope = '';
  if (rest.startsWith('@')) {
    const slash = rest.indexOf('/');
    scope = rest.slice(0, slash + 1);
    rest = rest.slice(slash + 1);
  }
  const at = rest.indexOf('@');
  const slash = rest.indexOf('/');
  let name, version = '', file = '';
  if (at !== -1 && (slash === -1 || at < slash)) {
    name = rest.slice(0, at);
    const tail = rest.slice(at + 1);
    const s2 = tail.indexOf('/');
    version = s2 === -1 ? tail : tail.slice(0, s2);
    file = s2 === -1 ? '' : tail.slice(s2 + 1);
  } else if (slash !== -1) {
    name = rest.slice(0, slash);
    file = rest.slice(slash + 1);
  } else {
    name = rest;
  }
  const pkg = scope + name;

  if (!version) {
    const meta = await fetch(`https://data.jsdelivr.com/v1/packages/npm/${pkg}`).then((r) => r.json());
    version = (meta.tags && meta.tags.latest) || (meta.versions && meta.versions[0] && meta.versions[0].version);
    if (!version) throw new Error(`could not resolve a version for ${pkg}`);
  }
  if (!file) {
    // try the declared css entrypoint, else first .css in a flat listing
    try {
      const ep = await fetch(`https://data.jsdelivr.com/v1/packages/npm/${pkg}@${version}/entrypoints`).then((r) => r.json());
      if (ep.entrypoints && ep.entrypoints.css && ep.entrypoints.css.file) {
        file = ep.entrypoints.css.file.replace(/^\//, '');
      }
    } catch { /* ignore */ }
    if (!file) {
      const flat = await fetch(`https://data.jsdelivr.com/v1/packages/npm/${pkg}@${version}?structure=flat`).then((r) => r.json());
      const cssFiles = (flat.files || []).map((f) => f.name).filter((n) => n.endsWith('.css'));
      cssFiles.sort((a, b) => score(b) - score(a));
      file = (cssFiles[0] || '').replace(/^\//, '');
    }
    if (!file) throw new Error(`no .css file found in ${pkg}@${version}`);
  }
  return { pkg, version, file, url: `https://cdn.jsdelivr.net/npm/${pkg}@${version}/${file.replace(/^\//, '')}` };
}

function score(name) {
  let s = 0;
  if (/\.min\.css$/.test(name)) s += 3;
  if (/(^|\/)dist\//.test(name)) s += 2;
  if (/(index|main|bundle|all)\.css$/.test(name)) s += 2;
  s -= name.split('/').length; // prefer shallow
  return s;
}
