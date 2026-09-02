// poc-kit add-ds <npm-name | https://…/x.css | --none> [--out vendor/ds.css]
// Acquire a design-system stylesheet for offline use, then introspect it.

import { resolve, dirname } from 'node:path';
import { mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs';
import { parseArgs, TEMPLATES, head, ok, info, warn } from './util.mjs';
import { introspectDs } from './introspect-ds.mjs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

export async function run(argv) {
  const args = parseArgs(argv);
  if (args.help || (args._.length === 0 && !args.none)) {
    console.log('poc-kit add-ds <npm-name | https://…/x.css | --none> [--out vendor/ds.css]');
    return;
  }
  const outCss = resolve(process.cwd(), args.out || 'vendor/ds.css');
  const outReport = resolve(dirname(outCss), 'ds-report.md');
  mkdirSync(dirname(outCss), { recursive: true });

  const spec = args._[0];
  let css, source;

  head('add-ds');
  if (args.none || spec === '--none') {
    copyFileSync(resolve(TEMPLATES, 'neutral-kit.css'), outCss);
    source = 'neutral-kit (no design system)';
    css = readFileSync(outCss, 'utf8');
    ok(`neutral kit -> ${rel(outCss)}`);
  } else if (/^https?:\/\//.test(spec)) {
    css = await fetchText(spec);
    writeFileSync(outCss, css);
    source = spec;
    ok(`${bytes(css)} from URL -> ${rel(outCss)}`);
  } else {
    const resolved = await resolveNpmCss(spec);
    css = await fetchText(resolved.url);
    writeFileSync(outCss, css);
    source = `npm:${resolved.pkg}@${resolved.version}/${resolved.file}`;
    ok(`${bytes(css)} from ${source} -> ${rel(outCss)}`);
  }

  const { markdown, stats } = introspectDs(css, { source, bytes: css.length });
  writeFileSync(outReport, markdown);
  ok(`introspected: ${stats.classes} classes, ${stats.customProps} custom properties -> ${rel(outReport)}`);
  info('');
  info(`Build against the names in ${rel(outReport)} — target selectors that exist.`);
}

function rel(p) { return p.replace(process.cwd() + '/', ''); }
function bytes(s) { return `${(Buffer.byteLength(s) / 1024).toFixed(1)} KB`; }

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/css,*/*' } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}

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
