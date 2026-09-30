// Small shared helpers. No external deps.
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

export const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const TEMPLATES = resolve(PKG_ROOT, 'templates');
export const SCHEMA = resolve(PKG_ROOT, 'schema');

// Minimal flag parser: returns { _: [positionals], flag: value | true }.
//   --key value   |   --key=value   |   --bool
export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) {
        out[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--')) { out[a.slice(2)] = next; i++; }
        else out[a.slice(2)] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

// All output goes to stdout, in order: an agent reading `2>&1` sees each failure under its header.
// Quiet mode drops "ok" lines, and prints a section header only if something is printed under it.
let QUIET = false;
let pending = null;
export function setQuiet(v) { QUIET = Boolean(v); pending = null; }
const say = (m) => { if (pending !== null) { console.log(`\n${pending}`); pending = null; } console.log(m); };

export const ok   = (m) => { if (!QUIET) say(`  ok    ${m}`); };
export const warn = (m) => say(`  warn  ${m}`);
export const info = (m) => say(`  ${m}`);
export const fail = (m) => say(`  FAIL  ${m}`);
export const head = (m) => { if (QUIET) pending = m; else console.log(`\n${m}`); };

// Path relative to the working directory, for messages.
export function rel(p) { return p.replace(process.cwd() + '/', ''); }

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

// GET a URL as text or bytes, failing clearly on a non-2xx response.
export async function fetchUrl(url, { as = 'text', accept = '*/*' } = {}) {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return as === 'buffer' ? res.arrayBuffer() : res.text();
}

// JSON for files people and agents read: indented, but any object or array that fits in `width`
// characters stays on one line. Much smaller than JSON.stringify(v, null, 2) and still diffable.
export function toJson(value, width = 96, indent = '') {
  const flat = JSON.stringify(value);
  if (flat === undefined || value === null || typeof value !== 'object' || flat.length + indent.length <= width) return flat;
  const inner = indent + '  ';
  const items = Array.isArray(value)
    ? value.map((v) => inner + toJson(v, width, inner))
    : Object.entries(value).filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${inner}${JSON.stringify(k)}: ${toJson(v, width, inner)}`);
  const [open, close] = Array.isArray(value) ? ['[', ']'] : ['{', '}'];
  return `${open}\n${items.join(',\n')}\n${indent}${close}`;
}

export function readConfig(cwd = process.cwd()) {
  const p = resolve(cwd, 'build.config.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    throw new Error(`build.config.json is not valid JSON: ${e.message}`);
  }
}
