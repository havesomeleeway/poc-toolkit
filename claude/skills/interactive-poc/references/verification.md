# Writing flow.json and reading verify output

For `METHOD.md` §8. Drive the real path a presenter would take and assert what would embarrass you
if it broke.

```json
{
  "url": "prototype.html",
  "viewport": [1200, 900],
  "a11y": true,
  "steps": [
    { "click": "[data-nav='screen-2']" },
    { "expectVisible": "[data-screen=screen-2]" },
    { "setValue": "#quantity", "to": "5" },
    { "expectText": "#total", "contains": "$" },
    { "expectNoConsoleErrors": true },
    { "screenshot": "totals" }
  ]
}
```

Step types: `click`, `setValue` (+`to`), `wait` (ms), `eval` (+`equals`), `expectVisible`,
`expectHidden`, `expectText` (+`contains`), `expectNoConsoleErrors`, `screenshot` (name), `pdf`
(path; only if the build has an export path). Schema: `cli/schema/flow.schema.json`.

Without a terminal, `verify` prints only failures, warnings and the tally; `--verbose` shows every
step.

## Reading failures

- **`no element <sel>`** — wrong selector, or the screen didn't change; check the step before.
- **`text was "…"`** — the mock model produced the wrong value; look there, not at the DOM.
- **`console errors: N`** — a real JS error. Always fails the run, even if the flow looked fine.
- **offline-safety `FAIL`** — something external slipped in (`@import`, CDN `<script>`, a URL).
- **`a11y: … (advisory)`** — not a gate; usually a one-line fix.
