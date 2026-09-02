// poc-kit copilot-init [--dir .] [--force]
// Drop the Copilot prompt file + instructions into a repo's .github/ so `/interactive-poc`
// works and Copilot knows the method. Idempotent.

import { resolve, join } from 'node:path';
import { mkdirSync, copyFileSync, existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { parseArgs, TEMPLATES, head, ok, warn, info } from './util.mjs';

const MARKER = '## Building interactive POCs / demo prototypes';

export async function run(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log('poc-kit copilot-init [--dir .] [--force]\n  Writes .github/prompts/interactive-poc.prompt.md and updates .github/copilot-instructions.md');
    return;
  }
  const root = resolve(process.cwd(), args.dir || '.');
  const gh = join(root, '.github');
  const promptsDir = join(gh, 'prompts');
  mkdirSync(promptsDir, { recursive: true });

  head(`copilot-init  ${root}`);

  // 1. prompt file
  const promptTarget = join(promptsDir, 'interactive-poc.prompt.md');
  if (existsSync(promptTarget) && !args.force) {
    warn('.github/prompts/interactive-poc.prompt.md exists — skipped (use --force)');
  } else {
    copyFileSync(join(TEMPLATES, 'copilot', 'interactive-poc.prompt.md'), promptTarget);
    ok('.github/prompts/interactive-poc.prompt.md');
  }

  // 2. instructions — strip the leading HTML comment from the snippet, then create or append
  const snippet = readFileSync(join(TEMPLATES, 'copilot', 'copilot-instructions.snippet.md'), 'utf8')
    .replace(/^<!--[\s\S]*?-->\s*/m, '')
    .trim() + '\n';
  const instr = join(gh, 'copilot-instructions.md');
  if (!existsSync(instr)) {
    writeFileSync(instr, snippet);
    ok('.github/copilot-instructions.md (created)');
  } else if (readFileSync(instr, 'utf8').includes(MARKER)) {
    ok('.github/copilot-instructions.md already has the poc-kit section — unchanged');
  } else {
    appendFileSync(instr, '\n' + snippet);
    ok('.github/copilot-instructions.md (appended poc-kit section)');
  }

  info('');
  info('In Copilot Chat (Agent mode): /interactive-poc');
  info('poc-kit must be installed where Copilot runs commands:  npm install -g poc-kit');
}
