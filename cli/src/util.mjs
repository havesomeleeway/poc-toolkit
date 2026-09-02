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

export const ok   = (m) => console.log(`  ok    ${m}`);
export const warn = (m) => console.log(`  warn  ${m}`);
export const info = (m) => console.log(`  ${m}`);
export const fail = (m) => console.error(`  FAIL  ${m}`);
export const head = (m) => console.log(`\n${m}`);

export function readConfig(cwd = process.cwd()) {
  const p = resolve(cwd, 'build.config.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    throw new Error(`build.config.json is not valid JSON: ${e.message}`);
  }
}
