// Small, dependency-free CSS scanning shared by the profile drafter and validator.
// Not a full parser: it finds innermost `selector { body }` rules (so rules inside @media
// are included), which is all a design-system index needs.

// A class selector token, including CSS escapes: Tailwind-style names such as
// .hover\:bg-red, .w-1\/2, .h-\[1\.25em\] and .\!m-0.
const ESC = String.raw`\\[0-9a-fA-F]{1,6}\s?|\\[^\n0-9a-fA-F]`;
const CLASS_TOKEN = new RegExp(String.raw`\.((?:${ESC}|[_a-zA-Z-])(?:${ESC}|[\w-])*)`, 'g');

export function unescapeCss(s) {
  return s
    .replace(/\\([0-9a-fA-F]{1,6})\s?/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/\\(.)/g, '$1');
}

// Every class named in a selector, unescaped: '.hover\:x > .a' -> ['hover:x', 'a'].
export function selectorClasses(selector) {
  return [...selector.matchAll(CLASS_TOKEN)].map((m) => unescapeCss(m[1]));
}

export function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, ' ');
}

// [{ selectors: ['.a', 'b > .c'], body: 'color: red; …', decls: 2 }]
export function rules(css) {
  const out = [];
  for (const m of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    if (!sel || sel.startsWith('@') || /^(from|to|\d+%)(\s*,|$)/.test(sel)) continue;
    const body = m[2];
    out.push({
      selectors: splitSelectorList(sel),
      body,
      decls: body.split(';').filter((d) => d.includes(':')).length,
    });
  }
  return out;
}

// Split "a, b:is(c, d)" on top-level commas only.
export function splitSelectorList(sel) {
  const parts = [];
  let depth = 0, cur = '';
  for (let i = 0; i < sel.length; i++) {
    const ch = sel[i];
    if (ch === '\\') { cur += ch + (sel[i + 1] || ''); i++; continue; }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

// The rightmost compound selector: "nav > ul li.item:hover" -> "li.item:hover".
export function subject(selector) {
  const s = selector.replace(/\s*([>+~])\s*/g, ' ').trim();
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\') { i++; continue; }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ' ' && depth === 0) start = i + 1;
  }
  return s.slice(start);
}

// Every compound selector: 'nav > ul li.item' -> ['nav', 'ul', 'li.item'].
export function compoundsOf(selector) {
  const s = selector.replace(/\s*([>+~])\s*/g, ' ').trim();
  const out = [];
  let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\') { cur += ch + (s[i + 1] || ''); i++; continue; }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ' ' && depth === 0) { if (cur) out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

// Parse one compound selector into its parts.
export function parseCompound(compound) {
  const classes = selectorClasses(compound);
  compound = compound.replace(CLASS_TOKEN, ''); // so escaped ':' and '[' in class names aren't read as pseudos/attributes
  const element = (compound.match(/^([a-z][a-z0-9-]*)/i) || [])[1] || null;
  const attributes = [...compound.matchAll(/\[\s*([a-zA-Z][\w-]*)\s*(?:([~|^$*]?=)\s*["']?([^"'\]]*)["']?)?\s*\]/g)]
    .map((m) => ({ name: m[1], op: m[2] || null, value: m[3] ?? null }));
  const pseudos = [...compound.matchAll(/:([a-z-]+)/g)].map((m) => m[1]);
  return { element: element ? element.toLowerCase() : null, classes, attributes, pseudos, implied: impliedElement(attributes) };
}

// [role=button], [type=submit] etc. style something that behaves as that element.
function impliedElement(attributes) {
  for (const a of attributes) {
    if (a.name === 'role' && a.value === 'button') return 'button';
    if (a.name === 'type' && ['button', 'submit', 'reset'].includes(a.value)) return 'button';
  }
  return null;
}

export function classSet(css) {
  const set = new Set();
  for (const m of stripComments(css).matchAll(/([^{}]+)\{/g)) {
    if (m[1].includes('@')) continue;
    for (const c of selectorClasses(m[1])) set.add(c);
  }
  return set;
}

export function customProps(css) {
  const set = new Set();
  for (const m of stripComments(css).matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)) set.add(m[1]);
  return set;
}

export function varsUsed(body) {
  return [...new Set([...body.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)/g)].map((m) => m[1]))];
}

// First declared value of each custom property: { '--x': '#fff' }.
export function customPropValues(css) {
  const out = {};
  for (const m of stripComments(css).matchAll(/(--[a-zA-Z0-9_-]+)\s*:\s*([^;{}]+)/g)) {
    if (!(m[1] in out)) out[m[1]] = m[2].trim();
  }
  return out;
}
