# poc-toolkit

Turn a written requirement (a spec, a ticket, a user story) into a **clickable prototype** — a
single HTML file you can open in any browser and share. It works with any design system, for any
kind of requirement.

The prototype:

- is **one file** with everything inside it, so it opens with no internet and nothing to install;
- uses the **real design system** you name, not a look-alike;
- has **fake but sensible** data and calculations, clearly labelled as not real;
- is **checked by actually clicking through it** in a real browser (running invisibly) before you
  see it — on a normal screen and a phone-sized one.

## What it decides, and what it doesn't

The toolkit gives you a method, some starter files, and the checks. It does **not** decide what
screens the prototype has, what they do, or what the numbers mean — all of that comes from your
requirement and your direction on each build.

## What you give it

- **Required:** the requirement (a file or pasted text); who it's for and how long you have to
  present (e.g. "a 3‑minute pitch to my manager").
- **Recommended:** the design system (an npm package name, a link to a CSS file, or "none"); which
  part of the requirement to build.
- **Optional:** who uses the screen, brand bits (font, colour, logo text), sample data, anything
  specific it must show, earlier sketches to match.

## What you get back

- `prototype.html` — the single shareable file.
- `prototype.src.html` + `vendor/` + `build.config.json` — the source, so it can be rebuilt.
- `flow.json` — the click-through test, so the check can be re-run.
- `out/` — a screenshot of every screen (normal and phone size).
- `HANDOFF.md` — a short note: what's real, what's fake, how to run and rebuild it.

## The pieces

| Path | What it is | Who uses it |
|---|---|---|
| [`METHOD.md`](./METHOD.md) | The step-by-step method. The single source of truth. | everyone |
| [`cli/`](./cli) | **`poc-kit`** — a small command-line tool that does the mechanical work: fetch the design system, build the single file, run the checks. | everyone (people, Copilot, Claude Code) |
| [`claude/`](./claude) | A Claude Code plugin that adds a `/interactive-poc` command and follows `METHOD.md`. | Claude Code users |
| [`copilot/`](./copilot) | How to add the same `/interactive-poc` command to GitHub Copilot. | Copilot users |

The Claude and Copilot pieces are thin — they both just follow `METHOD.md`. Change the method
there, not in them.

Finished example prototypes are kept **out of this repo** on purpose (a real build can contain
client material). Start every build fresh with `poc-kit init`.

## License

MIT — take it, use it, change it.

## Quick start (command line)

```bash
npm install -g poc-kit

# in a new folder for this build:
poc-kit init .                       # writes the starter files, incl. vendor/layout.css
poc-kit add-ds @picocss/pico         # an npm package name, a CSS URL, or --none
poc-kit add-font "Inter"             # optional; puts the font inside the file
#   ...build the screens the requirement needs, in prototype.src.html...
poc-kit build                        # combine everything into prototype.html + check it opens offline
poc-kit verify                       # click through it in a browser, normal + phone size
poc-kit handoff                      # start the HANDOFF.md note
```

`poc-kit verify` needs Chrome or Chromium for the click-through. Point `CHROME_PATH` at it, or
install one. Without it, `verify` still runs the offline and syntax checks and prints `DEGRADED`.

`vendor/layout.css` is a small set of layout helpers (`.pk-wrapper`, `.pk-flow`, `.pk-cluster`,
`.pk-repel`, `.pk-switcher`, `.pk-sidebar`, `.pk-grid`) that keep spacing even and screens
responsive. It's structure only — no colour or type — so it sits under any design system. Use
these instead of writing one-off layout CSS.

## Use it from Claude Code

Install the command-line tool first (needed either way):

```bash
npm install -g poc-kit
```

Then add the `/interactive-poc` command, using **one** of these:

**A. From GitHub, no clone.** In Claude Code:

```
/plugin marketplace add havesomeleeway/poc-toolkit
/plugin install interactive-poc@poc-toolkit
```

Later, `/plugin marketplace update poc-toolkit` pulls changes.

**B. From a local clone.**

```bash
bash claude/install-skill.sh        # copies it into ~/.claude
```

Re-run after `git pull`. Set `CLAUDE_SKILLS_DIR` / `CLAUDE_COMMANDS_DIR` to change where it goes.

**C. Symlink a local clone** (updates itself on `git pull`):

```bash
ln -s "$PWD/claude/skills/interactive-poc" ~/.claude/skills/interactive-poc
ln -s "$PWD/claude/commands/interactive-poc.md" ~/.claude/commands/interactive-poc.md
```

Then open a **new** Claude Code session and type `/interactive-poc` (or just ask for "a clickable
prototype of `<file>`").

## Use it from GitHub Copilot (VS Code)

There's nothing to install as an extension. You add a small prompt file to a project (or your VS
Code profile) and make the `poc-kit` tool runnable. You can do this yourself, or ask Copilot to.

**You'll need**

- VS Code with the **GitHub Copilot** and **GitHub Copilot Chat** extensions.
- **Node 18 or newer** (`node --version`).
- **Chrome or Chromium** — only for the click-through check; it's skipped (with a `DEGRADED` note)
  if missing.

### Option 1 — ask Copilot to set it up

Open **Copilot Chat**, change the mode dropdown (top of the box) to **Agent**, and send:

> Install the poc-kit tool with `npm install -g poc-kit`, then run `poc-kit copilot-init` in this
> repo. Then tell me how to use `/interactive-poc`.

Approve the commands when it asks. Then reload the window
(**Cmd/Ctrl+Shift+P → Developer: Reload Window**) so the new command shows up.

### Option 2 — do it yourself

1. Open a terminal (**Terminal → New Terminal**) and install the tool:

   ```bash
   npm install -g poc-kit
   ```

2. From the project folder, add the command:

   ```bash
   poc-kit copilot-init
   ```

   This creates `.github/prompts/interactive-poc.prompt.md` and
   `.github/copilot-instructions.md`. Commit both so teammates get the command too.

   *Want it in every project, not just one?* **Cmd/Ctrl+Shift+P → Chat: New Prompt File → User**,
   name it `interactive-poc`, and paste in
   [`cli/templates/copilot/interactive-poc.prompt.md`](./cli/templates/copilot/interactive-poc.prompt.md).

3. Reload the window.

### Run it

In **Copilot Chat**, set the mode to **Agent**, then type `/interactive-poc`. Give it the
requirement, the design system, and who it's for. It proposes a plan → you confirm → it builds
`prototype.html` and checks it. To view the result: right-click `prototype.html` →
**Open with Live Preview**, or **Download** it and open it in a browser.

### If something's wrong

| What you see | What to do |
|---|---|
| No `/interactive-poc` in the list | Mode must be **Agent**, not Ask/Edit. Reload the window. Check the `chat.promptFiles` setting is on. |
| `poc-kit: command not found` | Run `npm install -g poc-kit`, then open a fresh terminal. |
| It prints `DEGRADED` | No Chrome found — install Chrome/Chromium or set `CHROME_PATH`. The other checks still run. |
| The build has an error Copilot won't fix | Paste the `poc-kit verify` output back to it — it's meant to fix its own build. |

For teammates who won't touch a terminal, see
**[poc-toolkit-starter](https://github.com/havesomeleeway/poc-toolkit-starter)** — a one-click
GitHub template with Node, Chrome and `poc-kit` already set up, made to run in the browser
(Codespaces).
