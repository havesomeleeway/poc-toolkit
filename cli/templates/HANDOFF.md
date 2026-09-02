# <prototype name> — hand-off

<!-- Fill in as much or as little as the audience needs. Delete what doesn't apply. -->

## What this is

One self-contained HTML file demonstrating **<the one slice>** for **<the audience / purpose>**.
Open `prototype.html` in a browser — no server, no network.

## Real vs mocked

| Part | Real | Mocked |
|---|---|---|
| Design system / styling | ✅ actual `<design system>` CSS | |
| Screens & navigation | ✅ | |
| <logic / calculations / data> | | ✅ deterministic, illustrative only — not accurate |
| Integrations / persistence | | ✅ none; nothing is saved or sent |

## How to run

Double-click `prototype.html`, or `open prototype.html`. Works offline.

## How to rebuild

```
poc-kit build      # re-inlines vendor/* into prototype.src.html -> prototype.html
poc-kit verify     # static checks + headless-browser drive (if Chrome present)
```

Source: `prototype.src.html` + `vendor/` + `build.config.json`.

## Known gaps / next steps

- <what a real implementation would need to change or add>
