// Small, dependency-free HTML scanner for linting a prototype's source. Not a full HTML parser:
// it finds start tags with their attributes, nesting (tolerant of unclosed tags), line numbers,
// and the contents of <style> and <script> blocks. Enough for authored prototypes.

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title']);

// { elements: [{ tag, attrs, classes, line, parent }], styles: [{ text, line }], scripts: [{ attrs, text, line }] }
// `parent` is an index into `elements` (or -1).
export function scanHtml(html) {
  const elements = [], styles = [], scripts = [];
  const stack = [];
  const lineAt = lineIndex(html);
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) break;
    if (html.startsWith('<!--', lt)) { const e = html.indexOf('-->', lt + 4); i = e === -1 ? html.length : e + 3; continue; }
    if (html[lt + 1] === '!' || html[lt + 1] === '?') { const e = html.indexOf('>', lt); i = e === -1 ? html.length : e + 1; continue; }

    const close = html[lt + 1] === '/';
    const m = /^<\/?([a-zA-Z][\w:-]*)/.exec(html.slice(lt, lt + 64));
    if (!m) { i = lt + 1; continue; }
    const tag = m[1].toLowerCase();
    const end = tagEnd(html, lt + m[0].length);

    if (close) {
      // pop back to the matching open tag, if there is one (tolerates unclosed <p>, <li>, …)
      for (let k = stack.length - 1; k >= 0; k--) {
        if (elements[stack[k]].tag === tag) { stack.length = k; break; }
      }
      i = end + 1;
      continue;
    }

    const attrText = html.slice(lt + m[0].length, end).replace(/\/\s*$/, '');
    const attrs = parseAttrs(attrText);
    const el = {
      tag,
      attrs,
      classes: (attrs.class || '').split(/\s+/).filter(Boolean),
      line: lineAt(lt),
      parent: stack.length ? stack[stack.length - 1] : -1,
    };
    elements.push(el);
    const idx = elements.length - 1;
    i = end + 1;

    if (RAW.has(tag)) {
      const closeAt = html.toLowerCase().indexOf(`</${tag}`, i);
      const text = html.slice(i, closeAt === -1 ? html.length : closeAt);
      if (tag === 'style') styles.push({ text, line: lineAt(i) });
      if (tag === 'script') scripts.push({ attrs, text, line: lineAt(i) });
      i = closeAt === -1 ? html.length : tagEnd(html, closeAt) + 1;
      continue;
    }
    if (!VOID.has(tag) && !/\/\s*>$/.test(html.slice(lt, end + 1))) stack.push(idx);
  }
  return { elements, styles, scripts };
}

// Index of the '>' that ends a tag, skipping '>' inside quoted attribute values.
function tagEnd(html, from) {
  let q = null;
  for (let k = from; k < html.length; k++) {
    const ch = html[k];
    if (q) { if (ch === q) q = null; } else if (ch === '"' || ch === "'") q = ch; else if (ch === '>') return k;
  }
  return html.length - 1;
}

export function parseAttrs(text) {
  const out = {};
  for (const m of text.matchAll(/([^\s=/"'>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return out;
}

function lineIndex(text) {
  const starts = [0];
  for (let k = 0; k < text.length; k++) if (text[k] === '\n') starts.push(k + 1);
  return (pos) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= pos) lo = mid; else hi = mid - 1; }
    return lo + 1;
  };
}

// Walk up from an element: yields ancestors, nearest first.
export function* ancestors(elements, idx) {
  for (let p = elements[idx].parent; p !== -1; p = elements[p].parent) yield elements[p];
}
