# poc-toolkit

Turn a requirement into **one self-contained, offline, clickable HTML prototype** — styled with the
**real** target design system, driven by **mocked** logic, and **verified by driving it** in a
headless browser.

It is **design-system- and use-case-agnostic**. It supplies process, scaffolding and checks. It
does **not** decide the prototype's screens, interactions, mocked logic, or whether there's an
export path — those come from the requirement and your direction for each build.

## Parts

| Path | What | For |
|---|---|---|
| [`METHOD.md`](./METHOD.md) | The canonical 9-step method (source of truth) | everyone |
| [`cli/`](./cli) | **`poc-kit`** — Node CLI: `init` · `add-ds` · `add-font` · `build` · `verify` · `handoff` · `copilot-init` | everyone (humans, Copilot, Claude Code) |
| [`claude/`](./claude) | Claude Code **skill + plugin** (`/interactive-poc`) — thin, follows `METHOD.md`, calls `poc-kit` | Claude Code users |
| [`copilot/`](./copilot) | How to wire up Copilot — `poc-kit copilot-init`, or the files under `cli/templates/copilot/` | GitHub Copilot users |

Both assistant adapters are thin and mirror `METHOD.md`. Edit the method there, not in the
adapters.

Worked examples are kept **out of this repo** (`.gitignore`d) — a finished build can carry
client-derived material. Start every new build from `poc-kit init`.

## License

MIT — take it, adopt it, adapt it.

## Quick start (CLI)

```bash
npm install -g poc-kit

# in a working directory for the build:
poc-kit init .
poc-kit add-ds @picocss/pico          # or an npm name / CSS URL / --none
poc-kit add-font "Inter"              # optional; embeds the font offline
#   ... build the screens the requirement needs in prototype.src.html ...
poc-kit build                         # inline vendor/* -> prototype.html, lint offline
poc-kit verify                        # static checks + headless-browser drive (if Chrome present)
poc-kit handoff                       # HANDOFF.md skeleton
```

`poc-kit verify` needs a Chrome/Chromium binary for the interaction flow (set `CHROME_PATH` or
install one). Without it, it runs the static checks and prints `DEGRADED`.

## Use it from Claude Code

First, the CLI (needed either way):

```bash
npm install -g poc-kit
```

Then get the skill in, by **one** of these:

**A. Plugin from GitHub (no clone).** In Claude Code:

```
/plugin marketplace add havesomeleeway/poc-toolkit
/plugin install interactive-poc@poc-toolkit
```

`/plugin marketplace update poc-toolkit` pulls later changes.

**B. Personal install from a local clone.**

```bash
bash claude/install-skill.sh        # copies skill + /interactive-poc into ~/.claude
```

Re-run after `git pull` to update. Override paths with `CLAUDE_SKILLS_DIR` / `CLAUDE_COMMANDS_DIR`.

**C. Symlink a local clone** (auto-updates with `git pull`, nothing to re-run):

```bash
ln -s "$PWD/claude/skills/interactive-poc" ~/.claude/skills/interactive-poc
ln -s "$PWD/claude/commands/interactive-poc.md" ~/.claude/commands/interactive-poc.md
```

Then open a **new** Claude Code session and run `/interactive-poc` (or just ask for "an interactive
POC of `<doc>`" — the skill self-triggers).

## Use it from GitHub Copilot (VS Code)

There's no "extension" to install — you add a **prompt file** to a project (or your VS Code
profile) and make the **`poc-kit`** CLI runnable. Two paths: do it yourself, or have the Copilot
agent do it.

**Prerequisites**

- VS Code with the **GitHub Copilot** and **GitHub Copilot Chat** extensions.
- **Node 18+** (`node --version`).
- A **Chrome / Chromium** binary — only for `poc-kit verify`'s browser check; it degrades to
  static checks without one.

### Option 1 — let the Copilot agent set it up

Open **Copilot Chat**, set the mode dropdown (top of the chat box) to **Agent**, and send:

> Install the poc-kit CLI globally with `npm install -g poc-kit`, then run `poc-kit copilot-init`
> in this repo. Then tell me how to use `/interactive-poc`.

Approve the terminal commands when it asks. Reload the window afterwards
(**Cmd/Ctrl+Shift+P → Developer: Reload Window**) so the new prompt file is picked up.

### Option 2 — do it yourself

1. **Install the CLI** (in VS Code's terminal — **Terminal → New Terminal**):

   ```bash
   npm install -g poc-kit
   ```

2. **Add the command to your project** — from the project root:

   ```bash
   poc-kit copilot-init
   ```

   This writes `.github/prompts/interactive-poc.prompt.md` and creates/updates
   `.github/copilot-instructions.md`. Commit both so your team gets `/interactive-poc` too.

   *Want it in every project instead of one?* **Cmd/Ctrl+Shift+P → Chat: New Prompt File →
   User**, name it `interactive-poc`, and paste in
   [`cli/templates/copilot/interactive-poc.prompt.md`](./cli/templates/copilot/interactive-poc.prompt.md).

3. **Reload the window** so VS Code registers the prompt file.

### Run it

In **Copilot Chat**, set the mode to **Agent**, then type:

```
/interactive-poc
```

Give it the requirement (a file path or pasted text), the design system (npm name / CSS URL /
`none`), and the audience + time budget. It proposes a plan → you confirm → it builds
`prototype.html` and verifies it. To find the output: right-click `prototype.html` in the Explorer
→ **Open with Live Preview**, or **Download** and open it in a browser.

### If it doesn't work

| Symptom | Fix |
|---|---|
| `/interactive-poc` isn't offered | Mode must be **Agent** (not Ask/Edit). Reload the window. Check the setting `chat.promptFiles` is on. |
| `poc-kit: command not found` when Copilot runs it | `npm install -g poc-kit`; open a fresh terminal so `PATH` refreshes. |
| `verify` prints `DEGRADED` | No Chrome found — install Chrome/Chromium or set `CHROME_PATH`. Static checks still run. |
| Copilot's build has an error it won't fix | Paste the `poc-kit verify` output back to it — the prompt tells it to fix its own build. |

For teammates who don't use a terminal at all, see
**[poc-toolkit-starter](https://github.com/havesomeleeway/poc-toolkit-starter)** — a one-click
GitHub template with Node, Chrome and `poc-kit` pre-wired for Codespaces.

## What you provide per build

- **Required:** the requirement source; the purpose, audience and scope/time budget.
- **Recommended:** the design system (npm / URL / `--none`); which slice to build.
- **Optional:** persona hints, brand assets (font, colour, wordmark), sample data, any specific
  behaviour the prototype must show, prior artefacts to match.

## What you get

`prototype.html` (single, offline) · `prototype.src.html` + `vendor/` + `build.config.json`
(rebuildable) · `flow.json` (re-runnable check) · `out/` (screenshots + report) · `HANDOFF.md`.
