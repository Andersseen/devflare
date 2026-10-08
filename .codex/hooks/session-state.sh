#!/bin/sh
# SessionStart hook: surface docs/ai/STATE.md at the top of every session.
#
# AGENTS.md rule #8 and STATE.md's own header both say to load it at session
# start, but that relied on the model choosing to read it. This makes it
# deterministic, the same way block-protected-edits.sh made rule #1
# deterministic.
#
# STATE.md is ~230 lines and most of it is the append-only session log, so
# dumping the whole file would spend tokens every session on history nobody
# asked for. Only the two orienting sections are injected; the pointer below
# tells the model where to read the rest when a task actually needs it.
#
# Exit 0 always: stdout becomes session context, and a missing or malformed
# STATE.md must never stop a session from starting.
set -eu

project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"
state="$project_dir/docs/ai/STATE.md"

[ -f "$state" ] || exit 0

echo "## Project state (docs/ai/STATE.md)"
echo

# Print "## Branch & repo status" and "## Next steps ..." in full, skipping
# every other section. Matching the heading prefix keeps this working when the
# sections move or the doc grows.
awk '
  /^## / {
    keep = ($0 ~ /^## Branch & repo status/ || $0 ~ /^## Next steps/)
  }
  keep { print }
' "$state"

echo
echo "_Sections above only. Read docs/ai/STATE.md for known gaps, what works"
echo "today, and the session log. Update it via the wrap-session skill when you"
echo "finish meaningful work._"

exit 0
