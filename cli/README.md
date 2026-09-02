# poc-kit

The deterministic engine for building one **self-contained, offline** interactive POC from a
requirement: acquire a real design system, embed fonts, inline everything into a single HTML file,
and verify it by driving it in a headless browser.

`poc-kit` supplies process, scaffolding and checks. It does **not** decide the prototype's screens,
interactions, mocked logic, or whether there's an export path — those come from the requirement.

Full method: **https://github.com/havesomeleeway/poc-toolkit** (`METHOD.md`).

## Install

```bash
npm install -g poc-kit
```

`poc-kit verify` uses a headless Chrome/Chromium for the interaction flow — set `CHROME_PATH` if it
isn't auto-found. Without one, `verify` runs the static checks and prints `DEGRADED`.

## Commands

```
poc-kit init [dir]                    Scaffold a bare skeleton (screen router + build markers).
poc-kit add-ds <npm | url | --none>   Acquire a design-system stylesheet offline + introspect it.
poc-kit add-font <family | ./file>    Embed a font as a base64 @font-face.
poc-kit build                         Inline vendor/* into the markers -> prototype.html, lint offline.
poc-kit verify [file] [--flow f.json] Static checks always; headless-browser drive when Chrome is present.
poc-kit handoff                       Emit a blank HANDOFF.md skeleton.
poc-kit copilot-init                  Drop the Copilot prompt + instructions into ./.github/.
```

## Typical run

```bash
poc-kit init .
poc-kit add-ds @picocss/pico          # or an npm name / CSS URL / --none
poc-kit add-font "Inter"              # optional
#   ...build the screens the requirement needs in prototype.src.html...
poc-kit build
poc-kit verify
poc-kit handoff
```

## Env

- `CHROME_PATH` — path to a Chrome/Chromium binary.
- `POC_KIT_CHROME_FLAGS` — extra Chrome flags (containers/CI usually need
  `"--no-sandbox --disable-dev-shm-usage"`).
- `POC_KIT_NO_CHROME=1` — force the static-only (`DEGRADED`) path.
- `POC_KIT_DEBUG=1` — full stack traces on error.

MIT.
