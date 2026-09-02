#!/usr/bin/env bash
# Install the interactive-poc skill + /interactive-poc command into your personal
# Claude Code config (~/.claude), so they're available in every session.
#
#   bash claude/install-skill.sh
#
# Override locations with CLAUDE_SKILLS_DIR / CLAUDE_COMMANDS_DIR if you keep
# Claude config elsewhere.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
SKILLS_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
COMMANDS_DIR="${CLAUDE_COMMANDS_DIR:-$HOME/.claude/commands}"
DEST="$SKILLS_DIR/interactive-poc"

mkdir -p "$DEST/references" "$COMMANDS_DIR"
cp "$ROOT/METHOD.md"                                   "$DEST/METHOD.md"
cp "$HERE/skills/interactive-poc/SKILL.md"             "$DEST/SKILL.md"
cp "$HERE/skills/interactive-poc/references/"*.md      "$DEST/references/"
cp "$HERE/commands/interactive-poc.md"                 "$COMMANDS_DIR/interactive-poc.md"

echo "Installed:"
echo "  skill    -> $DEST"
echo "  command  -> $COMMANDS_DIR/interactive-poc.md"
echo
if command -v poc-kit >/dev/null 2>&1; then
  echo "poc-kit:   $(command -v poc-kit)  ($(poc-kit --help | head -1))"
else
  echo "Next:      npm install -g poc-kit"
fi
echo "Then:      open a new Claude Code session and run  /interactive-poc"
