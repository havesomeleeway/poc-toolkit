#!/usr/bin/env node
// poc-kit — build one self-contained, offline, design-system-styled interactive POC.
// The toolkit provides process + scaffolding + verification only. What the POC *does*
// (its screens, interactions, mocked logic, any export path) comes from the requirement.

import process from 'node:process';

const COMMANDS = {
  init:          () => import('../src/initCmd.mjs'),
  'add-ds':      () => import('../src/addDs.mjs'),
  'add-font':    () => import('../src/addFont.mjs'),
  build:         () => import('../src/build.mjs'),
  verify:        () => import('../src/verify.mjs'),
  handoff:       () => import('../src/handoff.mjs'),
  'copilot-init':() => import('../src/copilotInit.mjs'),
};

const HELP = `poc-kit <command> [options]

  init [dir]                       Scaffold a bare structural skeleton (no widgets, no styling).
  add-ds <npm | url | --none>      Acquire a design system stylesheet offline + introspect it.
  add-font <family | ./file>       Embed a font as a base64 @font-face.
  build                            Inline vendor/* into the markers -> prototype.html, then lint offline.
  verify [file] [--flow flow.json] Static checks always; headless-browser drive when Chrome is present.
  handoff                          Emit a blank HANDOFF.md skeleton.
  copilot-init                     Drop the Copilot prompt + instructions into ./.github/.

Run "poc-kit <command> --help" for command options.
Everything about the POC's screens, interactions and any export behaviour is a per-build
decision (design system + requirement), not something poc-kit dictates.`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    console.log(HELP);
    process.exit(cmd ? 0 : 1);
  }
  const loader = COMMANDS[cmd];
  if (!loader) {
    console.error(`poc-kit: unknown command "${cmd}"\n\n${HELP}`);
    process.exit(1);
  }
  try {
    const mod = await loader();
    await mod.run(rest);
  } catch (err) {
    console.error(`poc-kit ${cmd}: ${err && err.message ? err.message : err}`);
    if (process.env.POC_KIT_DEBUG) console.error(err);
    process.exit(1);
  }
}

main();
