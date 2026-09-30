// Design-system linter. Runs on the prototype source during `build` and fails it when the markup
// drifts from the design-system profile: invented classes, untagged or mis-tagged components,
// hard-coded colours and spacing, duplicate IDs, undeclared features.
//
// Tags it reads:
//   data-screen="<id>"                 on each .screen
//   data-component="<Component>"       a component from the profile (plus data-id)
//   data-variant="<v> [<v>…]"          variants of that component
//   data-state="<s> [<s>…]"            states of that component
//   data-part="<part>"                 a named part, inside its component
//   data-id="<stable.id>"              unique; kept across revisions
//   data-feature="<feature> […]"       declared in <script type="application/json" id="poc-features">

import { scanHtml, ancestors } from './html-scan.mjs';
import { rules as cssRules } from './css-scan.mjs';
import { profileClasses, profileTokens, suggest, describeMarkup } from './ds-profile.mjs';

export const RULES = {
  'unknown-class': 'a class that is not in the design-system profile or layout.css',
  'unknown-component': 'data-component names a component the profile does not have',
  'unknown-variant': 'data-variant names a variant the component does not have',
  'unknown-state': 'data-state names a state the component does not have',
  'unknown-part': 'data-part names a part the component does not have',
  'part-outside-component': 'data-part is not inside an element with data-component',
  'markup-mismatch': "a tagged element does not have its component's markup",
  'untagged-widget': 'a control or design-system component without data-component',
  'missing-id': 'a component without data-id',
  'bad-id': 'a data-id, data-screen or feature id that is not a lowercase slug',
  'duplicate-id': 'the same data-id or data-screen used twice',
  'screen-untagged': 'a .screen without data-screen',
  'inline-style': 'a style="" attribute that sets colour, type, spacing or borders',
  'raw-color': 'a hard-coded colour instead of a design-system token',
  'unknown-feature': 'data-feature names a feature that is not declared',
  'unused-feature': 'a declared feature that no element uses',
  'bad-features-block': 'the poc-features block is not a list of { id, title, source? }',
};

const SCAFFOLD_CLASSES = ['screen'];
const ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const NATIVE_WIDGETS = new Set(['button', 'select', 'textarea']);
const SKIP_TAGS = new Set(['html', 'head', 'meta', 'title', 'link', 'style', 'script', 'template', 'body']);
const VISUAL_PROP = /^(color|background(-color|-image)?|font(-[a-z]+)?|line-height|letter-spacing|text-(decoration|transform|shadow)|margin(-[a-z]+)*|padding(-[a-z]+)*|gap|row-gap|column-gap|border(-[a-z]+)*|outline(-[a-z]+)*|box-shadow)$/;
const COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(|(?:^|[\s,(])(?:red|blue|green|black|white|gray|grey|orange|yellow|purple|pink|navy|teal)(?=$|[\s,);])/i;
const BUILD_MARKER = /^\s*\/\*__[A-Z_]+__\*\/\s*$/;

export function lintDs(html, { profile, layoutClasses = [], allow = [] } = {}) {
  const { elements, styles, scripts } = scanHtml(html);
  const found = [];
  const add = (rule, line, target, message) => found.push({ rule, line, target, message });

  const components = new Map(profile.components.map((c) => [c.name, c]));
  const known = new Set([...profileClasses(profile), ...layoutClasses, ...SCAFFOLD_CLASSES]);
  const tokens = new Set(profileTokens(profile));

  // --- features --------------------------------------------------------------------------------
  const declared = new Map();
  const block = scripts.find((s) => s.attrs.id === 'poc-features');
  if (block) {
    let list;
    try { list = JSON.parse(block.text || '[]'); } catch (e) {
      add('bad-features-block', block.line, 'poc-features', `poc-features is not valid JSON: ${e.message}`);
    }
    if (list !== undefined && !Array.isArray(list)) {
      add('bad-features-block', block.line, 'poc-features', 'poc-features must be a JSON list');
    } else for (const f of list || []) {
      if (!f || typeof f.id !== 'string' || typeof f.title !== 'string' || !f.title.trim()
        || ('source' in f && typeof f.source !== 'string')) {
        add('bad-features-block', block.line, 'poc-features', `each feature needs "id" and "title" (and optionally "source"): ${JSON.stringify(f)}`);
        continue;
      }
      if (!ID.test(f.id)) add('bad-id', block.line, f.id, `feature id "${f.id}" must be a lowercase slug, e.g. "export-csv"`);
      if (declared.has(f.id)) add('bad-features-block', block.line, f.id, `feature "${f.id}" is declared twice`);
      declared.set(f.id, f);
    }
  }
  const usedFeatures = new Set();

  // --- elements --------------------------------------------------------------------------------
  const ids = new Map(), screens = new Map(), unknownClasses = new Map();

  elements.forEach((el, idx) => {
    if (SKIP_TAGS.has(el.tag) || insideHead(elements, idx)) return;
    const a = el.attrs;
    const label = a['data-id'] || `<${el.tag}>`;

    for (const c of el.classes) {
      if (known.has(c)) continue;
      const u = unknownClasses.get(c) || { line: el.line, count: 0 };
      u.count++;
      unknownClasses.set(c, u);
    }

    if (el.classes.includes('screen') && !('data-screen' in a)) {
      add('screen-untagged', el.line, a.id || '.screen', `.screen${a.id ? `#${a.id}` : ''} needs data-screen="<id>"`);
    }
    if ('data-screen' in a) {
      const s = a['data-screen'];
      if (!ID.test(s)) add('bad-id', el.line, s, `data-screen="${s}" must be a lowercase slug`);
      if (screens.has(s)) add('duplicate-id', el.line, s, `data-screen="${s}" is also used on line ${screens.get(s)}`);
      else screens.set(s, el.line);
    }
    if ('data-id' in a) {
      const id = a['data-id'];
      if (!ID.test(id)) add('bad-id', el.line, id, `data-id="${id}" must be a lowercase slug, e.g. "checkout.pay"`);
      if (ids.has(id)) add('duplicate-id', el.line, id, `data-id="${id}" is also used on line ${ids.get(id)}`);
      else ids.set(id, el.line);
    }
    for (const f of words(a['data-feature'])) {
      usedFeatures.add(f);
      if (!declared.has(f)) add('unknown-feature', el.line, f, `data-feature="${f}" is not declared in <script type="application/json" id="poc-features">`);
    }

    if ('style' in a) checkInlineStyle(a.style, el.line, label, add, tokens);

    if ('data-component' in a) checkComponent(el, components, profile, add);
    else if ('data-part' in a) checkPart(el, idx, elements, components, add);
    else if (!(el.tag === 'input' && a.type === 'hidden')) {
      const like = profile.components.find((c) => looksLike(el, c.markup));
      const native = NATIVE_WIDGETS.has(el.tag) || el.tag === 'input' || a.role === 'button';
      if (like) {
        add('untagged-widget', el.line, like.name, `<${el.tag}> looks like ${like.name} but has no data-component — tag it (poc-kit ds lookup ${like.name})`);
      } else if (native) {
        add('untagged-widget', el.line, `<${el.tag}>`, `<${el.tag}> is a control with no data-component, and ${profile.name} has no component for it — see poc-kit ds list`);
      }
    }
  });

  for (const [c, u] of unknownClasses) {
    const hint = c.startsWith('pk-') ? 'layout.css has no such class' : `not in ${profile.name} — poc-kit ds list, or ds lookup <Component>`;
    add('unknown-class', u.line, c, `.${c} (${u.count}×): ${hint}`);
  }
  for (const [id, f] of declared) {
    if (!usedFeatures.has(id)) add('unused-feature', block.line, id, `feature "${id}" (${f.title}) is declared but no element has data-feature="${id}"`);
  }

  // --- author CSS: <style> blocks other than the build markers ----------------------------------
  for (const s of styles) {
    if (BUILD_MARKER.test(s.text)) continue;
    for (const r of cssRules(s.text)) {
      for (const decl of r.body.split(';')) {
        const colon = decl.indexOf(':');
        if (colon === -1) continue;
        const prop = decl.slice(0, colon).trim(), value = decl.slice(colon + 1).trim();
        if (COLOR.test(value)) {
          const at = s.text.indexOf(decl.trim());
          const line = s.line + (at === -1 ? 0 : s.text.slice(0, at).split('\n').length - 1);
          add('raw-color', line, `${r.selectors.join(', ')} { ${prop} }`, `${r.selectors.join(', ')} { ${prop}: ${value} } — use a design-system token, e.g. var(--…)`);
        }
      }
    }
  }

  // --- allow-list ------------------------------------------------------------------------------
  const violations = [], allowed = [];
  const used = new Set();
  for (const v of found) {
    const i = allow.findIndex((x) => x.rule === v.rule && (x.target === v.target || x.target === '*'));
    if (i === -1) violations.push(v);
    else { allowed.push({ ...v, reason: allow[i].reason }); used.add(i); }
  }
  const unusedAllow = allow.filter((_, i) => !used.has(i));
  violations.sort((x, y) => x.line - y.line || x.rule.localeCompare(y.rule));

  return {
    ok: violations.length === 0,
    violations,
    allowed,
    unusedAllow,
    stats: { components: elements.filter((e) => 'data-component' in e.attrs).length, screens: screens.size, features: declared.size },
  };
}

function checkComponent(el, components, profile, add) {
  const a = el.attrs;
  const name = a['data-component'];
  const label = a['data-id'] || `<${el.tag} data-component="${name}">`;
  const comp = components.get(name);
  if (!comp) {
    const near = suggest(profile, name);
    add('unknown-component', el.line, name, `data-component="${name}" is not in ${profile.name}${near.length ? ` — did you mean ${near.join(', ')}?` : ' — see poc-kit ds list'}`);
    return;
  }
  if (!('data-id' in a)) add('missing-id', el.line, name, `${name} on line ${el.line} needs a data-id (a stable id like "screen.action")`);

  const variants = words(a['data-variant']), states = words(a['data-state']);
  for (const v of variants) if (!comp.variants || !(v in comp.variants)) {
    add('unknown-variant', el.line, `${name}.${v}`, `${name} has no variant "${v}"${comp.variants ? ` — it has: ${Object.keys(comp.variants).join(', ')}` : ''}`);
  }
  for (const s of states) if (!comp.states || !(s in comp.states)) {
    add('unknown-state', el.line, `${name}.${s}`, `${name} has no state "${s}"${comp.states ? ` — it has: ${Object.keys(comp.states).join(', ')}` : ''}`);
  }

  const layers = [comp.markup, ...variants.map((v) => comp.variants?.[v]), ...states.map((s) => comp.states?.[s])].filter(Boolean);
  const expected = merge(layers);
  const problems = missingMarkup(el, expected);

  // classes that belong to a variant or state this element does not declare
  const declaredClasses = new Set(expected.classes);
  for (const [kind, map, chosen] of [['variant', comp.variants, variants], ['state', comp.states, states]]) {
    for (const [k, m] of Object.entries(map || {})) {
      if (chosen.includes(k)) continue;
      for (const c of m.classes || []) {
        if (el.classes.includes(c) && !declaredClasses.has(c)) problems.push(`has .${c} (${kind} "${k}") but data-${kind} does not include "${k}"`);
      }
    }
  }
  if (problems.length) add('markup-mismatch', el.line, a['data-id'] || name, `${label}: ${problems.join('; ')} — expected ${describeMarkup(expected)}`);
}

function checkPart(el, idx, elements, components, add) {
  const part = el.attrs['data-part'];
  let owner = null;
  for (const anc of ancestors(elements, idx)) if ('data-component' in anc.attrs) { owner = anc; break; }
  if (!owner) {
    add('part-outside-component', el.line, part, `data-part="${part}" must be inside an element with data-component`);
    return;
  }
  const comp = components.get(owner.attrs['data-component']);
  if (!comp) return; // already reported as unknown-component
  const m = comp.parts && comp.parts[part];
  if (!m) {
    add('unknown-part', el.line, `${comp.name}.${part}`, `${comp.name} has no part "${part}"${comp.parts ? ` — it has: ${Object.keys(comp.parts).join(', ')}` : ''}`);
    return;
  }
  const problems = missingMarkup(el, merge([m]));
  if (problems.length) add('markup-mismatch', el.line, `${comp.name}.${part}`, `${comp.name} part "${part}": ${problems.join('; ')} — expected ${describeMarkup(m)}`);
}

function merge(layers) {
  const out = { element: null, classes: [], attributes: {} };
  for (const m of layers) {
    if (m.element) out.element = m.element;
    for (const c of m.classes || []) if (!out.classes.includes(c)) out.classes.push(c);
    Object.assign(out.attributes, m.attributes || {});
  }
  if (!out.element) delete out.element;
  return out;
}

function missingMarkup(el, expected) {
  const problems = [];
  if (expected.element && el.tag !== expected.element) problems.push(`is <${el.tag}>, should be <${expected.element}>`);
  for (const c of expected.classes) if (!el.classes.includes(c)) problems.push(`missing .${c}`);
  for (const [k, v] of Object.entries(expected.attributes)) {
    if (!(k in el.attrs)) problems.push(`missing ${v === '' ? k : `${k}="${v}"`}`);
    else if (v !== '' && el.attrs[k] !== v) problems.push(`${k}="${el.attrs[k]}" should be "${v}"`);
  }
  return problems;
}

// Does an untagged element look like this component? By element and classes; by attributes only
// when the component has neither.
function looksLike(el, markup) {
  if (!markup) return false;
  const hasEl = Boolean(markup.element), hasCls = Boolean(markup.classes && markup.classes.length);
  if (hasEl && el.tag !== markup.element) return false;
  if (hasCls && !markup.classes.every((c) => el.classes.includes(c))) return false;
  if (!hasEl && !hasCls) {
    const attrs = Object.entries(markup.attributes || {});
    return attrs.length > 0 && attrs.every(([k, v]) => k in el.attrs && (v === '' || el.attrs[k] === v));
  }
  return true;
}

// style="" may set layout, local custom properties (data values like --pct: 42%), and visual
// properties whose value is made only of design-system tokens. It may not hard-code a visual value
// or override a design-system token.
function checkInlineStyle(style, line, label, add, tokens) {
  for (const decl of style.split(';')) {
    const colon = decl.indexOf(':');
    if (colon === -1) continue;
    const prop = decl.slice(0, colon).trim().toLowerCase(), value = decl.slice(colon + 1).trim();
    const shown = `${prop}: ${value.length > 60 ? value.slice(0, 57) + '…' : value}`;
    if (COLOR.test(value)) add('raw-color', line, label, `${label}: style="${shown}" — use a design-system token`);
    else if (prop.startsWith('--')) {
      if (tokens.has(prop)) add('inline-style', line, label, `${label}: style="${shown}" overrides a design-system token for one element`);
    } else if (VISUAL_PROP.test(prop) && !tokensOnly(value, tokens)) {
      add('inline-style', line, label, `${label}: style="${shown}" — use a design-system token (var(--…)), the design system's classes, or a .pk-* layout primitive`);
    }
  }
}

// "var(--kumo-danger)", "0", "var(--a) var(--b)": nothing but design-system tokens and neutral keywords.
function tokensOnly(value, tokens) {
  let unknown = false;
  const rest = value.replace(/var\(\s*(--[\w-]+)\s*(?:,[^()]*)?\)/g, (_, t) => { if (!tokens.has(t)) unknown = true; return ' '; });
  return !unknown && /^(\s|0|auto|none|inherit|initial|unset|transparent|currentcolor|solid|dashed|!important)*$/i.test(rest);
}

function insideHead(elements, idx) {
  for (const anc of ancestors(elements, idx)) if (anc.tag === 'head') return true;
  return false;
}

function words(v) {
  return (v || '').split(/\s+/).filter(Boolean);
}

export function printLintDs(result, { ok, info, fail, warn }) {
  for (const v of result.violations) fail(`line ${v.line}  [${v.rule}]  ${v.message}`);
  if (result.allowed.length) {
    info(`allowed by build.config.json (${result.allowed.length}):`);
    for (const v of result.allowed) info(`  line ${v.line}  [${v.rule}]  ${v.target} — ${v.reason}`);
  }
  for (const x of result.unusedAllow) warn(`allow entry matches nothing: ${x.rule} ${x.target} — remove it`);
  if (result.ok) {
    const s = result.stats;
    ok(`design-system lint: ${s.components} tagged components, ${s.screens} screens, ${s.features} features`);
  }
}

// Check the "allow" entries in build.config.json. Returns problems.
export function validateAllow(allow) {
  if (allow === undefined) return [];
  if (!Array.isArray(allow)) return ['"allow" must be a list of { rule, target, reason }'];
  const problems = [];
  allow.forEach((x, i) => {
    if (!x || typeof x !== 'object') return problems.push(`allow[${i}] must be an object`);
    if (!(x.rule in RULES)) problems.push(`allow[${i}].rule "${x.rule}" is not a rule (${Object.keys(RULES).join(', ')})`);
    if (typeof x.target !== 'string' || !x.target) problems.push(`allow[${i}].target is required (the class, component, id or feature it names, or "*")`);
    if (typeof x.reason !== 'string' || !x.reason.trim()) problems.push(`allow[${i}].reason is required — say why this exception is OK`);
  });
  return problems;
}
