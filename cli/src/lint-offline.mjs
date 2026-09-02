// Offline-safety linter. A finished POC must open with no network at all.
// Hard-fails on any reference that would trigger a request.

const RE = {
  linkTag:      /<link\b[^>]*>/gi,
  scriptSrc:    /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi,
  atImport:     /@import\b[^;]*/gi,
  cssUrlHttp:   /url\(\s*["']?\s*(?:https?:)?\/\/[^)]*\)/gi,
  anchorHttp:   /\b(?:href|src|action|poster|data|cite|formaction)\s*=\s*["']\s*(?:https?:)?\/\/[^"']+/gi,
  netApi:       /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|importScripts)\s*\(/g,
  sendBeacon:   /navigator\.sendBeacon\s*\(/g,
  bareUrl:      /https?:\/\/[^\s"'`)<>\]]+/gi,
};

// URLs that never cause a network fetch (namespaces, spec identifiers).
const ALLOW = [
  'http://www.w3.org/',
  'https://www.w3.org/',
];

function isAllowed(url) {
  return ALLOW.some((a) => url.startsWith(a));
}

function collect(re, html) {
  const hits = [];
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(html)) !== null) {
    hits.push({ index: m.index, text: m[0].slice(0, 120), url: m[1] });
  }
  return hits;
}

function lineOf(html, index) {
  return html.slice(0, index).split('\n').length;
}

export function lintOffline(html) {
  const violations = [];
  const add = (kind, hit) =>
    violations.push({ kind, line: lineOf(html, hit.index), text: hit.text });

  // <link> — allow only data: hrefs
  for (const h of collect(RE.linkTag, html)) {
    if (!/\bhref\s*=\s*["']data:/i.test(h.text)) add('external <link>', h);
  }
  // <script src>
  for (const h of collect(RE.scriptSrc, html)) {
    if (h.url && !h.url.startsWith('data:')) add('external <script src>', h);
  }
  // @import
  for (const h of collect(RE.atImport, html)) {
    if (!/@import\s+["']?data:/.test(h.text)) add('@import', h);
  }
  // url(http…) in CSS
  for (const h of collect(RE.cssUrlHttp, html)) add('CSS url(http…)', h);
  // attribute = "http…"
  for (const h of collect(RE.anchorHttp, html)) {
    const url = h.text.split(/["']/).pop();
    if (!isAllowed(url)) add('attribute -> http(s) URL', h);
  }
  // network APIs in script
  for (const h of collect(RE.netApi, html)) add('network API call', h);
  for (const h of collect(RE.sendBeacon, html)) add('navigator.sendBeacon', h);

  // Any remaining bare http(s):// occurrence outside comments (text, JS strings, CSS values).
  // Comments (CSS /* */, HTML <!-- -->, JS // …) trigger no network, so blank them first
  // while preserving offsets for accurate line numbers.
  const noComments = html
    .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
    .replace(/<!--[\s\S]*?-->/g, (m) => ' '.repeat(m.length))
    .replace(/(^|[^:])\/\/[^\n\r]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
  const seen = new Set(violations.map((v) => v.line + v.text));
  for (const h of collect(RE.bareUrl, noComments)) {
    if (isAllowed(h.text)) continue;
    const key = lineOf(html, h.index) + h.text.slice(0, 120);
    if (seen.has(key)) continue;
    add('stray http(s):// reference', h);
  }

  // De-noise: when a specific tag rule already flagged a line, drop the
  // generic attribute/stray echoes for that same line.
  const specificLines = new Set(
    violations.filter((v) => v.kind === 'external <script src>' || v.kind === 'external <link>').map((v) => v.line),
  );
  const deduped = violations.filter(
    (v) => !(specificLines.has(v.line) && (v.kind === 'attribute -> http(s) URL' || v.kind === 'stray http(s):// reference')),
  );

  return { ok: deduped.length === 0, violations: deduped };
}

export function printReport(result) {
  if (result.ok) {
    console.log('  ok    offline-safe: no external references');
    return;
  }
  console.error(`  FAIL  ${result.violations.length} external reference(s):`);
  for (const v of result.violations) {
    console.error(`          line ${v.line}  [${v.kind}]  ${v.text.replace(/\s+/g, ' ')}`);
  }
}
