// Introspect a design-system stylesheet: list the real class names + custom
// properties so a build targets selectors that actually exist. Rough but useful —
// it is an index, not a full CSS parse.

export function introspectDs(css, { source = 'unknown', bytes = css.length } = {}) {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, ' ');

  // custom properties that are *defined* (--x: …)
  const defined = new Set();
  for (const m of stripped.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)) defined.add(m[1]);

  // class names: take selector text (before each { ) and pull .tokens out
  const classes = new Set();
  for (const m of stripped.matchAll(/([^{}]+)\{/g)) {
    const sel = m[1];
    if (sel.includes('@')) continue;
    for (const c of sel.matchAll(/\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g)) classes.add(c[1]);
  }

  // media breakpoints
  const media = new Set();
  for (const m of stripped.matchAll(/@media[^{]+/g)) media.add(m[0].trim().replace(/\s+/g, ' '));

  // font families named in font-family / --*font* tokens
  const fonts = new Set();
  for (const m of stripped.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) fonts.add(m[1].trim());

  const classList = [...classes].sort((a, b) => a.localeCompare(b));
  const byPrefix = groupByPrefix(classList);

  const md = [];
  md.push(`# Design system report`);
  md.push('');
  md.push(`- source: \`${source}\``);
  md.push(`- size: ${(bytes / 1024).toFixed(1)} KB`);
  md.push(`- classes: ${classList.length}`);
  md.push(`- custom properties: ${defined.size}`);
  md.push('');
  md.push(`## Custom properties (${defined.size})`);
  md.push('');
  md.push('```');
  md.push([...defined].sort().join('\n') || '(none)');
  md.push('```');
  md.push('');
  md.push(`## Classes by prefix`);
  md.push('');
  for (const [prefix, items] of byPrefix) {
    md.push(`### \`${prefix}\` (${items.length})`);
    md.push('');
    md.push('```');
    md.push(items.join('  '));
    md.push('```');
    md.push('');
  }
  if (media.size) {
    md.push(`## Media queries`);
    md.push('');
    md.push('```');
    md.push([...media].join('\n'));
    md.push('```');
    md.push('');
  }
  if (fonts.size) {
    md.push(`## font-family declarations`);
    md.push('');
    md.push('```');
    md.push([...fonts].slice(0, 20).join('\n'));
    md.push('```');
    md.push('');
  }
  return {
    markdown: md.join('\n'),
    stats: { classes: classList.length, customProps: defined.size, bytes },
  };
}

function groupByPrefix(classes) {
  const groups = new Map();
  for (const c of classes) {
    const dash = c.indexOf('-');
    const key = dash > 0 ? c.slice(0, dash) : '(no prefix)';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  // largest groups first, cap noise
  return [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 40);
}
