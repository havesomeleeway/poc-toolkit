// Small, dependency-free CSS scanning shared by the profile drafter and validator.
// Not a full parser: it finds innermost `selector { body }` rules (so rules inside @media
// are included), which is all a design-system index needs.

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
  for (const ch of sel) {
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
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ' ' && depth === 0) start = i + 1;
  }
  return s.slice(start);
}

// Parse one compound selector into its parts.
export function parseCompound(compound) {
  const element = (compound.match(/^([a-z][a-z0-9-]*)/i) || [])[1] || null;
  const classes = [...compound.matchAll(/\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g)].map((m) => m[1]);
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
    for (const c of m[1].matchAll(/\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g)) set.add(c[1]);
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
