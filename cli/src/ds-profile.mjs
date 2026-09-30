// Design-system profile: which components a design system has and how each is marked up.
// A profile is written once per design system, reviewed by a person, and reused by every
// project that uses that design system. `draftProfile` produces a first guess from the CSS;
// `validateProfile` checks a profile's shape and that it matches the actual stylesheet.
//
// A "markup" is { element?, classes?, attributes? }. Components, variants, states and parts
// all use it, so class-based (.btn.btn-primary), BEM (.cds--btn--primary) and classless
// (button[data-variant=secondary]) design systems are described the same way.

import { rules, subject, parseCompound, classSet, customProps, customPropValues, varsUsed, compoundsOf, selectorClasses } from './css-scan.mjs';

export const PROFILE_VERSION = '0.1';

const VARIANT_WORDS = new Set((
  'primary secondary tertiary success danger warning info light dark error neutral brand accent '
  + 'critical positive negative caution notice inverse contrast ghost outline outlined link plain subtle '
  + 'solid filled text flat raised elevated tonal quiet emphasis '
  + 'xs sm md lg xl xxl small medium large mini tiny compact dense comfortable block full fluid inline '
  + 'vertical horizontal rounded pill square circle icon '
  + 'red orange yellow green teal blue indigo purple pink gray grey white black'
).split(' '));

const STATE_WORDS = new Set((
  'active disabled open closed selected checked loading busy invalid valid expanded collapsed '
  + 'current pressed readonly required indeterminate'
).split(' '));

// Attribute / pseudo-class selectors that express a state the author sets on the element.
const ATTR_STATES = {
  disabled: ['disabled', { disabled: '' }],
  'aria-disabled': ['disabled', { 'aria-disabled': 'true' }],
  'aria-invalid': ['invalid', { 'aria-invalid': 'true' }],
  'aria-busy': ['busy', { 'aria-busy': 'true' }],
  'aria-current': ['current', { 'aria-current': 'page' }],
  'aria-expanded': ['expanded', { 'aria-expanded': 'true' }],
  'aria-selected': ['selected', { 'aria-selected': 'true' }],
  'aria-pressed': ['pressed', { 'aria-pressed': 'true' }],
  'aria-checked': ['checked', { 'aria-checked': 'true' }],
  checked: ['checked', { checked: '' }],
  open: ['open', { open: '' }],
  readonly: ['readonly', { readonly: '' }],
  required: ['required', { required: '' }],
};
const PSEUDO_STATES = {
  disabled: ['disabled', { disabled: '' }],
  checked: ['checked', { checked: '' }],
  'read-only': ['readonly', { readonly: '' }],
  indeterminate: ['indeterminate', { 'aria-checked': 'mixed' }],
};
// Attributes whose value names a variant directly.
const VARIANT_ATTRS = new Set(['data-variant', 'variant', 'type', 'data-kind', 'data-size', 'role']);

const WIDGET_ELEMENTS = {
  button: 'Button', input: 'Input', select: 'Select', textarea: 'TextArea', table: 'Table',
  dialog: 'Dialog', details: 'Details', progress: 'Progress', meter: 'Meter', nav: 'Nav',
  article: 'Article', fieldset: 'Fieldset', label: 'Label', a: 'Link',
};
const VOID = new Set(['input', 'img', 'br', 'hr', 'meta', 'link', 'source', 'col', 'area', 'wbr']);

// ---------------------------------------------------------------------------------------------
// Draft

export function draftProfile(css, { name = 'Unnamed design system', version, stylesheet, docs, generatedBy } = {}) {
  const allRules = rules(css);
  const defined = customProps(css);   // var(--x, fallback) can name a property that is never defined
  const classes = [...classSet(css)].sort();
  const ns = namespace(classes);
  const local = (c) => (ns && c.startsWith(ns) ? c.slice(ns.length) : c);
  const byLocal = new Map(classes.map((c) => [local(c), c]));

  // One pass over every compound selector:
  //   own[cls]       most declarations in a rule that styles .cls on its own (utility rules excluded)
  //   bare           classes used without a widget element (.btn, .card)
  //   qualified[cls] widget elements a class is attached to (button.secondary)
  const own = new Map(), bare = new Set(), qualified = new Map();
  for (const r of allRules) {
    const utility = r.decls <= 2 || (r.body.match(/!important/g) || []).length * 2 >= r.decls;
    for (const s of r.selectors) {
      for (const compound of compounds(s)) {
        const p = parseCompound(compound);
        const el = (p.element && WIDGET_ELEMENTS[p.element]) ? p.element : p.implied;
        for (const c of p.classes) {
          if (el) {
            if (!qualified.has(c)) qualified.set(c, new Set());
            qualified.get(c).add(el);
          } else bare.add(c);
        }
      }
      const subj = parseCompound(subject(s));
      if (subj.classes.length === 1 && !utility) {
        const c = subj.classes[0];
        own.set(c, Math.max(own.get(c) || 0, r.decls));
      }
    }
  }
  // A component has a real rule of its own; utility classes (1-2 declarations, !important) don't.
  const substantial = (l) => (own.get(byLocal.get(l)) || 0) >= 3;

  const assigned = new Set();
  const components = [];

  // --- class-based components ----------------------------------------------------------------
  const isStateClass = (l) => /(^|-)(is|has)-/.test(l);
  // Tailwind-style names (hover:x, w-1/2, h-[3px], !m-0) are always utilities, never components.
  const plain = (l) => /^[\w-]+$/.test(l) && !/^-|-$/.test(l);
  const elementVariant = (l) => qualified.has(byLocal.get(l)) && !bare.has(byLocal.get(l));
  const bem = new Map();          // block -> { parts: Map(name -> class), mods: Map(name -> class) }
  const children = new Map();     // dash root -> [child locals]

  for (const [l, full] of byLocal) {
    if (isStateClass(l) || elementVariant(l) || !plain(l)) continue;
    const m = l.match(/^([a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*?)(__|--)(.+)$/);
    if (m) {
      const [, block, sep, rest] = m;
      if (!bem.has(block)) bem.set(block, { parts: new Map(), mods: new Map() });
      (sep === '__' ? bem.get(block).parts : bem.get(block).mods).set(rest, full);
      continue;
    }
    const segs = l.split('-');
    for (let i = segs.length - 1; i > 0; i--) {
      const prefix = segs.slice(0, i).join('-');
      if (byLocal.has(prefix) && !isStateClass(prefix) && plain(prefix)) {
        if (!children.has(prefix)) children.set(prefix, []);
        children.get(prefix).push(l);
        break;
      }
    }
  }

  const roots = new Set([
    ...children.keys(),
    ...[...bem.keys()].filter((b) => byLocal.has(b)),
    ...[...byLocal.keys()].filter((l) => !l.includes('__') && !l.includes('--') && !isChild(l)),
  ].filter((l) => plain(l) && !isStateClass(l) && !elementVariant(l) && substantial(l)));
  function isChild(l) { for (const kids of children.values()) if (kids.includes(l)) return true; return false; }

  for (const root of [...roots].sort()) {
    const rootClass = byLocal.get(root);
    const comp = { name: pascal(root), markup: { classes: [rootClass] }, variants: {}, states: {}, parts: {} };
    assigned.add(rootClass);

    for (const kid of children.get(root) || []) {
      if (roots.has(kid)) continue;
      const suffix = kid.slice(root.length + 1);
      if (!suffix) continue;
      addModifier(comp, suffix, byLocal.get(kid));
      assigned.add(byLocal.get(kid));
    }
    const b = bem.get(root);
    if (b) {
      for (const [part, cls] of b.parts) { comp.parts[part] = { classes: [cls] }; assigned.add(cls); }
      for (const [mod, cls] of b.mods) { addModifier(comp, mod, cls); assigned.add(cls); }
    }

    const tokens = new Set();
    for (const r of allRules) {
      const related = [rootClass, ...Object.values(comp.variants).flatMap((v) => v.classes || [])];
      if (!r.selectors.some((s) => related.some((c) => hasClass(s, c)))) continue;
      for (const t of varsUsed(r.body)) tokens.add(t);
      for (const s of r.selectors) {
        for (const compound of compounds(s)) {
          const p = parseCompound(compound);
          if (!p.classes.includes(rootClass)) continue;
          collectStates(comp, p, (cls) => { assigned.add(cls); });
        }
      }
    }
    comp.tokens = [...tokens].filter((t) => defined.has(t)).sort();
    components.push(comp);
  }

  // --- element-based components (classless design systems) ----------------------------------
  const byElement = new Map();
  for (const r of allRules) {
    for (const s of r.selectors) {
      const p = parseCompound(subject(s));
      if (!p.element && p.implied && p.classes.length) p.element = p.implied;
      if (!p.element || !WIDGET_ELEMENTS[p.element]) continue;
      if (!byElement.has(p.element)) byElement.set(p.element, { decls: 0, compounds: [], tokens: new Set(), classes: new Set() });
      const e = byElement.get(p.element);
      if (p.classes.length) {
        // button.secondary: a class that only ever qualifies this element is one of its variants
        for (const c of p.classes) if (elementVariant(local(c)) && !isStateClass(local(c))) e.classes.add(c);
        if (!p.classes.every((c) => elementVariant(local(c)))) continue;
      }
      e.decls += r.decls;
      e.compounds.push(p);
      for (const t of varsUsed(r.body)) e.tokens.add(t);
    }
  }
  const taken = new Set(components.map((c) => c.name));
  for (const [el, e] of [...byElement].sort()) {
    if (e.decls < 2 && !e.classes.size) continue;
    let compName = WIDGET_ELEMENTS[el];
    if (taken.has(compName)) compName = `Native${compName}`;
    const comp = { name: compName, markup: { element: el }, variants: {}, states: {}, parts: {} };
    for (const p of e.compounds) {
      collectStates(comp, p);
      for (const a of p.attributes) {
        if (ATTR_STATES[a.name] || a.value === null || a.op !== '=') continue;
        // [role=button] / button[type=submit] say what the element is or does, not how it looks
        if ((a.name === 'role' && a.value === el) || (el === 'button' && a.name === 'type')) continue;
        const vname = VARIANT_ATTRS.has(a.name) ? a.value : `${a.name}-${a.value}`;
        if (/^[a-zA-Z0-9][\w-]*$/.test(vname)) comp.variants[vname] = { attributes: { [a.name]: a.value } };
      }
    }
    for (const c of e.classes) { comp.variants[local(c)] = { classes: [c] }; assigned.add(c); }
    comp.tokens = [...e.tokens].filter((t) => defined.has(t)).sort();
    components.push(comp);
    taken.add(compName);
  }

  for (const c of components) tidy(c);
  components.sort((a, b) => a.name.localeCompare(b.name));
  dedupeNames(components);

  return {
    profileVersion: PROFILE_VERSION,
    name,
    ...(version ? { version } : {}),
    ...(stylesheet ? { stylesheet } : {}),
    ...(docs ? { docs } : {}),
    reviewed: false,
    ...(generatedBy ? { generatedBy } : {}),
    components,
    tokens: groupTokens(customPropValues(css)),
    utilities: classes.filter((c) => !assigned.has(c)),
  };
}

function addModifier(comp, suffix, cls) {
  const words = suffix.split('-');
  if (words.some((w) => STATE_WORDS.has(w))) comp.states[suffix] = { classes: [cls] };
  else if (words.some((w) => VARIANT_WORDS.has(w) || /^\d+$/.test(w))) comp.variants[suffix] = { classes: [cls] };
  else comp.parts[suffix] = { classes: [cls] };
}

function collectStates(comp, p, onClass = () => {}) {
  for (const ps of p.pseudos) {
    const s = PSEUDO_STATES[ps];
    if (s) comp.states[s[0]] = { attributes: { ...s[1] } };
  }
  for (const a of p.attributes) {
    const s = ATTR_STATES[a.name];
    if (s && (a.value === null || !/^false$/i.test(a.value))) comp.states[s[0]] = { attributes: { ...s[1] } };
  }
  for (const c of p.classes) {
    const m = c.match(/(?:^|-)(is|has)-(.+)$/);
    if (m) { comp.states[m[2]] = { classes: [c] }; onClass(c); }
  }
}

function tidy(c) {
  for (const k of ['variants', 'states', 'parts']) {
    if (!Object.keys(c[k]).length) delete c[k];
    else c[k] = Object.fromEntries(Object.entries(c[k]).sort(([a], [b]) => a.localeCompare(b)));
  }
  if (c.tokens && !c.tokens.length) delete c.tokens;
}

function dedupeNames(components) {
  const seen = new Map();
  for (const c of components) {
    const n = seen.get(c.name) || 0;
    seen.set(c.name, n + 1);
    if (n) c.name = `${c.name}${n + 1}`;
  }
}

// A namespace prefix shared by most classes (e.g. "cds--" in Carbon), which is not a class itself.
function namespace(classes) {
  if (classes.length < 5) return null;
  const counts = new Map();
  for (const c of classes) {
    const m = c.match(/^([a-z][a-z0-9]{0,5})(--|-)/);
    if (m) counts.set(m[0], (counts.get(m[0]) || 0) + 1);
  }
  const set = new Set(classes);
  const [best, n] = [...counts].sort((a, b) => b[1] - a[1])[0] || [];
  if (!best || n < classes.length * 0.4) return null;
  if (set.has(best.replace(/-+$/, ''))) return null;
  return best;
}

// Group custom properties by what their value is (colour, font, radius, shadow, space), falling
// back to the first word of the name. Groups follow W3C design-token type names where one fits.
const COLOR_VALUE = /^(#[0-9a-f]{3,8}\b|(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix)\(|transparent$|currentcolor$|(white|black|red|green|blue|gray|grey|orange|yellow|purple|pink|teal|navy)$)/i;
const NAME_GROUPS = [
  [/(^|-)(font|family|typeface)(-|$)/, 'fontFamily'],
  [/(^|-)(weight)(-|$)/, 'fontWeight'],
  [/(^|-)(line-height|leading|letter|tracking)(-|$)/, 'typography'],
  [/(^|-)(radius|rounded|corner)(-|$)/, 'radius'],
  [/(^|-)(shadow|elevation)(-|$)/, 'shadow'],
  [/(^|-)(duration|transition|easing|motion|animation)(-|$)/, 'motion'],
  [/(^|-)(space|spacing|gap|gutter|padding|margin|inset)(-|$)/, 'space'],
  [/(^|-)(breakpoint|bp|screen)(-|$)/, 'breakpoint'],
  [/(^|-)(z|z-index|layer)(-|$)/, 'zIndex'],
  [/(^|-)(font-size|text-size|size)(-|$)/, 'dimension'],
];

function tokenGroup(name, value = '') {
  const n = name.slice(2).toLowerCase();
  for (const [re, g] of NAME_GROUPS) if (re.test(n) && g !== 'dimension') return g;
  const v = value.trim();
  if (COLOR_VALUE.test(v)) return 'color';
  if (/(^|,\s*)["']?[A-Z][\w -]+["']?\s*,|\b(sans-serif|serif|monospace|system-ui)\b/.test(v)) return 'fontFamily';
  if (/^-?[\d.]+(px|rem|em)\s+-?[\d.]+(px|rem|em)/.test(v) && /(rgb|#|hsl)/i.test(v)) return 'shadow';
  if (/^-?[\d.]+(ms|s)$/.test(v)) return 'motion';
  if (/^-?[\d.]+(px|rem|em|%|vw|vh|ch)?$/.test(v) || /^calc\(/.test(v)) return 'dimension';
  if (/^var\(/.test(v)) return 'alias';
  return 'other';
}

function groupTokens(values) {
  const groups = {};
  for (const name of Object.keys(values).sort()) (groups[tokenGroup(name, values[name])] ||= []).push(name);
  return Object.fromEntries(Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)));
}

const compounds = compoundsOf;

const classCache = new Map();
function hasClass(selector, cls) {
  let list = classCache.get(selector);
  if (!list) { list = selectorClasses(selector); classCache.set(selector, list); }
  return list.includes(cls);
}

function pascal(s) {
  const out = s.split(/[-_]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
  return /^[A-Z]/.test(out) ? out : `C${out}`;
}

// ---------------------------------------------------------------------------------------------
// Validate

const PROFILE_FIELDS = ['$schema', 'profileVersion', 'name', 'version', 'stylesheet', 'docs', 'reviewed', 'generatedBy', 'components', 'tokens', 'utilities'];
const COMPONENT_FIELDS = ['name', 'description', 'docs', 'markup', 'variants', 'states', 'parts', 'tokens', 'snippet'];
const NAME = /^[A-Z][A-Za-z0-9]*$/;
const KEY = /^[a-zA-Z0-9][\w-]*$/;
const CLASS = /^\S+$/; // any class a class="" attribute can hold, including hover:x or w-1/2
const ELEMENT = /^[a-z][a-z0-9-]*$/;

// Returns a list of problems (strings). Empty means valid. With `css`, also checks that every
// class and token the profile names exists in that stylesheet.
export function validateProfile(profile, { css } = {}) {
  const problems = [];
  const bad = (m) => problems.push(m);
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return ['profile is not a JSON object'];

  for (const k of Object.keys(profile)) if (!PROFILE_FIELDS.includes(k)) bad(`unknown field "${k}"`);
  if (profile.profileVersion !== PROFILE_VERSION) bad(`profileVersion must be "${PROFILE_VERSION}"`);
  if (typeof profile.name !== 'string' || !profile.name.trim()) bad('name is required');
  if (typeof profile.reviewed !== 'boolean') bad('reviewed must be true or false');
  for (const k of ['version', 'stylesheet', 'docs', 'generatedBy']) {
    if (k in profile && typeof profile[k] !== 'string') bad(`${k} must be a string`);
  }
  if (!Array.isArray(profile.components)) { bad('components must be an array'); return problems; }

  const names = new Set();
  profile.components.forEach((c, i) => {
    const at = c && typeof c.name === 'string' ? c.name : `components[${i}]`;
    if (!c || typeof c !== 'object') return bad(`${at}: not an object`);
    for (const k of Object.keys(c)) if (!COMPONENT_FIELDS.includes(k)) bad(`${at}: unknown field "${k}"`);
    if (!NAME.test(c.name || '')) bad(`${at}: name must be PascalCase (e.g. "Button")`);
    if (names.has(c.name)) bad(`${at}: duplicate component name`);
    names.add(c.name);
    checkMarkup(c.markup, `${at}.markup`, bad, { required: true });
    for (const k of ['variants', 'states', 'parts']) {
      if (!(k in c)) continue;
      if (!c[k] || typeof c[k] !== 'object' || Array.isArray(c[k])) { bad(`${at}.${k} must be an object`); continue; }
      for (const [key, m] of Object.entries(c[k])) {
        if (!KEY.test(key)) bad(`${at}.${k}: "${key}" is not a valid name`);
        checkMarkup(m, `${at}.${k}.${key}`, bad, { required: k !== 'variants' });
      }
    }
    if ('tokens' in c && !isTokenList(c.tokens)) bad(`${at}.tokens must be a list of "--custom-property" names`);
    for (const k of ['description', 'docs', 'snippet']) if (k in c && typeof c[k] !== 'string') bad(`${at}.${k} must be a string`);
  });

  if ('tokens' in profile) {
    if (!profile.tokens || typeof profile.tokens !== 'object' || Array.isArray(profile.tokens)) bad('tokens must be an object of groups');
    else for (const [g, list] of Object.entries(profile.tokens)) if (!isTokenList(list)) bad(`tokens.${g} must be a list of "--custom-property" names`);
  }
  if ('utilities' in profile && !(Array.isArray(profile.utilities) && profile.utilities.every((u) => CLASS.test(u)))) {
    bad('utilities must be a list of class names');
  }

  if (css !== undefined && !problems.length) {
    const have = classSet(css);
    const props = customProps(css);
    for (const cls of profileClasses(profile)) if (!have.has(cls)) bad(`.${cls} is not in the stylesheet`);
    for (const t of profileTokens(profile)) if (!props.has(t)) bad(`${t} is not defined in the stylesheet`);
  }
  return problems;
}

function checkMarkup(m, at, bad, { required }) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return bad(`${at} must be an object`);
  const known = ['element', 'classes', 'attributes'];
  for (const k of Object.keys(m)) if (!known.includes(k)) bad(`${at}: unknown field "${k}"`);
  if (required && !m.element && !(m.classes && m.classes.length) && !(m.attributes && Object.keys(m.attributes).length)) {
    bad(`${at} needs an element, classes or attributes`);
  }
  if ('element' in m && !ELEMENT.test(m.element || '')) bad(`${at}.element is not a valid element name`);
  if ('classes' in m && !(Array.isArray(m.classes) && m.classes.every((c) => CLASS.test(c)))) bad(`${at}.classes must be a list of class names`);
  if ('attributes' in m && !(m.attributes && typeof m.attributes === 'object' && !Array.isArray(m.attributes)
    && Object.values(m.attributes).every((v) => typeof v === 'string'))) bad(`${at}.attributes must map names to strings`);
}

function isTokenList(v) {
  return Array.isArray(v) && v.every((t) => typeof t === 'string' && /^--[a-zA-Z0-9_-]+$/.test(t));
}

export function profileClasses(profile) {
  const out = new Set(profile.utilities || []);
  for (const c of profile.components || []) {
    for (const m of markups(c)) for (const cls of m.classes || []) out.add(cls);
  }
  return [...out].sort();
}

export function profileTokens(profile) {
  const out = new Set(Object.values(profile.tokens || {}).flat());
  for (const c of profile.components || []) for (const t of c.tokens || []) out.add(t);
  return [...out].sort();
}

function markups(c) {
  return [c.markup, ...['variants', 'states', 'parts'].flatMap((k) => Object.values(c[k] || {}))].filter(Boolean);
}

// ---------------------------------------------------------------------------------------------
// Lookup helpers

export function findComponent(profile, query) {
  const q = String(query).toLowerCase();
  return profile.components.find((c) => c.name.toLowerCase() === q) || null;
}

export function suggest(profile, query, max = 5) {
  const q = String(query).toLowerCase();
  return profile.components
    .map((c) => ({ name: c.name, d: c.name.toLowerCase().includes(q) || q.includes(c.name.toLowerCase()) ? 0 : distance(q, c.name.toLowerCase()) }))
    .filter((x) => x.d <= Math.max(2, Math.floor(q.length / 3)))
    .sort((a, b) => a.d - b.d || a.name.localeCompare(b.name))
    .slice(0, max)
    .map((x) => x.name);
}

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

// Merge a component's root markup with one variant/state (or none) and render it as HTML.
export function snippet(component, extra = {}) {
  const base = component.markup || {};
  const el = extra.element || base.element || 'div';
  const classes = [...(base.classes || []), ...(extra.classes || [])];
  const attrs = { ...(base.attributes || {}), ...(extra.attributes || {}) };
  if (el === 'button' && !('type' in attrs)) attrs.type = 'button';
  const parts = [el];
  if (classes.length) parts.push(`class="${classes.join(' ')}"`);
  for (const [k, v] of Object.entries(attrs)) parts.push(v === '' ? k : `${k}="${v}"`);
  const open = `<${parts.join(' ')}>`;
  return VOID.has(el) ? open : `${open}…</${el}>`;
}

export function describeMarkup(m) {
  if (!m) return '';
  const bits = [];
  if (m.element) bits.push(m.element);
  for (const c of m.classes || []) bits.push(`.${c}`);
  for (const [k, v] of Object.entries(m.attributes || {})) bits.push(v === '' ? `[${k}]` : `[${k}="${v}"]`);
  return bits.join('') || '(default)';
}
