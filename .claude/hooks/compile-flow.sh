#!/bin/sh
# PostToolUse hook: recompile dev-auth .flow templates after one is edited.
#
# Without this, editing a .flow leaves the served .flow.js stale, because the
# compile step only runs via 'build:flow' or wrangler's [build] command.
#
# Exit 2 = surface stderr back to Claude (the edit already happened; this only
# reports that the generated output is now out of date).
set -eu

path=$(jq -r '.tool_input.file_path // empty' 2>/dev/null || true)

case "$path" in
  *.flow) ;;
  *) exit 0 ;;
esac

# Hooks inherit a minimal PATH; flowmark lives in ~/.cargo/bin and node may be
# under a version manager shim.
PATH="$HOME/.cargo/bin:$HOME/.local/bin:$PATH"
export PATH

project_dir="${CLAUDE_PROJECT_DIR:-$(git -C "$(dirname "$path")" rev-parse --show-toplevel 2>/dev/null || pwd)}"
auth_dir="$project_dir/apps/dev-auth"

if ! command -v flowmark >/dev/null 2>&1; then
  echo "flowmark binary not found — $path was edited but NOT recompiled." >&2
  echo "The served .flow.js is now stale. Install it with:" >&2
  echo "  cargo install --path crates/flowmark-cli   # in the flowmark repo" >&2
  echo "See docs/ai/STATE.md for the open binary-dependency issue." >&2
  exit 2
fi

if ! output=$(cd "$auth_dir" && node scripts/compile-flow.mjs 2>&1); then
  echo "flowmark compile FAILED after editing $path:" >&2
  echo "$output" >&2
  exit 2
fi

exit 0
