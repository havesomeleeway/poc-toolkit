# Writing flow.json and reading verify output

Expanded from `METHOD.md` §8. `poc-kit verify` is how you know the POC actually works — not a
screenshot.

## What `verify` does

| Layer | When | Gate? |
|---|---|---|
| offline-safety lint | always | **yes** — output must be self-contained |
| inline `<script>` syntax (`node --check`) | always | **yes** |
| `flow.json` step assertions | Chrome present | **yes** |
| zero console errors during the flow | Chrome present | **yes** |
| a11y smoke (labels, focus-visible, aria-hidden svg, title, body bg) | Chrome present | advisory (warn only) |
| `DEGRADED` notice + static-only pass | Chrome absent | n/a |

## Authoring the flow

Write it from the screens you actually built. Drive the *real* path a presenter would take, and
assert the things that would embarrass you if broken.

```json
{
  "url": "prototype.html",
  "viewport": [1200, 900],
  "a11y": true,
  "steps": [
    { "click": "[data-nav='screen-2']" },
    { "expectVisible": "#screen-2" },
    { "setValue": "#quantity", "to": "5" },
    { "expectText": "#total", "contains": "$" },
    { "expectNoConsoleErrors": true },
    { "screenshot": "totals" }
  ]
}
```

Step types: `click`, `setValue` (+`to`), `wait` (ms), `eval` (+optional `equals`),
`expectVisible`, `expectHidden`, `expectText` (+`contains`), `expectNoConsoleErrors`,
`screenshot` (name), `pdf` (path — a plain capture, only if this build has an export path).
Full schema: `cli/schema/flow.schema.json`.

## Reading failures

- **`FAIL step N: … — no element <sel>`** — selector wrong, or the screen didn't advance. Check
  the prior `click`/`showScreen`.
- **`FAIL … expectText — text was "…"`** — the render ran but produced the wrong value; look at
  the mock model, not the DOM plumbing.
- **`console errors: N`** with `exception: …` — a real JS error; the flow may still have
  "passed" visually. This always fails the run. Fix it.
- **offline-safety `FAIL`** — something external slipped in (a font `@import`, a CDN `<script>`,
  a stray URL). Inline it or remove it.
- **`a11y: … (advisory)`** — not a gate, but worth a look; usually a one-line fix (add a label,
  set a body background, add `aria-hidden` to a decorative icon).

Re-run until `PASS`, then open the screenshots in `out/`.

## Notes

- `poc-kit verify` finds Chrome via `CHROME_PATH`, then platform defaults, then `PATH`.
- `POC_KIT_NO_CHROME=1` forces the `DEGRADED` (static-only) path — useful in CI or to check the
  static gates in isolation.
- Set `POC_KIT_DEBUG=1` for full stack traces on a CLI error.
