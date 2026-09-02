// poc-kit add-font <family | ./file.woff2> [--weights 400,600,700] [--subset latin]
//                   [--family "Name"] [--out vendor/font.css]
// Produce a self-contained vendor/font.css with base64 @font-face rules.
// On any network failure it writes a harmless comment and exits 0 (graceful).

import { resolve, dirname, basename, extname } from 'node:path';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { parseArgs, head, ok, warn, info } from './util.mjs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const MIME = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' };

export async function run(argv) {
  const args = parseArgs(argv);
  if (args.help || args._.length === 0) {
    console.log('poc-kit add-font <family | ./file.woff2> [--weights 400,600,700] [--subset latin] [--family "Name"] [--out vendor/font.css]');
    return;
  }
  const spec = args._[0];
  const out = resolve(process.cwd(), args.out || 'vendor/font.css');
  mkdirSync(dirname(out), { recursive: true });
  head('add-font');

  try {
    let css;
    if (isLocalFile(spec)) css = fromLocal(spec, args);
    else css = await fromGoogle(spec, args);
    writeFileSync(out, css);
    ok(`${(Buffer.byteLength(css) / 1024).toFixed(1)} KB -> ${rel(out)}`);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    writeFileSync(out, `/* poc-kit add-font: font not embedded (${msg.replace(/\*\//g, '* /')}) */\n`);
    warn(`could not embed font: ${msg}`);
    info(`wrote placeholder ${rel(out)} — the build still succeeds; add a font later.`);
  }
}

function rel(p) { return p.replace(process.cwd() + '/', ''); }

function isLocalFile(s) {
  return s.startsWith('.') || s.startsWith('/') || Object.keys(MIME).includes(extname(s).toLowerCase());
}

function fromLocal(file, args) {
  const p = resolve(process.cwd(), file);
  if (!existsSync(p)) throw new Error(`no such file: ${file}`);
  const ext = extname(p).toLowerCase();
  const mime = MIME[ext];
  if (!mime) throw new Error(`unsupported font type: ${ext}`);
  const b64 = readFileSync(p).toString('base64');
  const family = args.family || basename(p, ext).replace(/[-_]/g, ' ');
  ok(`local ${basename(p)} as "${family}"`);
  return [
    `@font-face{`,
    `  font-family:${JSON.stringify(family)};`,
    `  font-style:normal;font-weight:100 900;font-display:swap;`,
    `  src:url(data:${mime};base64,${b64}) format(${JSON.stringify(ext.slice(1))});`,
    `}`,
    '',
  ].join('\n');
}

async function fromGoogle(family, args) {
  const weights = String(args.weights || '400;500;600;700').replace(/,/g, ';');
  const subset = (args.subset || 'latin').toLowerCase();
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weights}&display=swap`;
  const sheet = await get(url, 'text');

  // Google emits blocks prefixed by a "/* subset */" comment.
  const blocks = [];
  const re = /\/\*\s*([a-z0-9-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/gi;
  let m;
  while ((m = re.exec(sheet)) !== null) {
    if (m[1].toLowerCase() === subset) blocks.push(m[2]);
  }
  if (blocks.length === 0) throw new Error(`no @font-face for subset "${subset}" in Google Fonts response`);

  // download + inline each unique woff2 url
  const seen = new Map();
  const outBlocks = [];
  for (const block of blocks) {
    let rewritten = block;
    const urls = [...block.matchAll(/url\((https:\/\/[^)]+\.woff2)\)/g)].map((x) => x[1]);
    for (const u of urls) {
      if (!seen.has(u)) {
        const buf = await get(u, 'buffer');
        seen.set(u, `data:font/woff2;base64,${Buffer.from(buf).toString('base64')}`);
      }
      rewritten = rewritten.replace(u, seen.get(u));
    }
    outBlocks.push(rewritten);
  }
  ok(`Google Fonts "${family}" · subset ${subset} · ${seen.size} file(s)`);
  return `/* ${family} — embedded by poc-kit add-font (subset: ${subset}) */\n` + outBlocks.join('\n') + '\n';
}

async function get(url, as) {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return as === 'buffer' ? res.arrayBuffer() : res.text();
}
