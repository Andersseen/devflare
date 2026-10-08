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

# Hooks inherit a minimal PATH; node may be under a version manager shim.
PATH="$HOME/.local/bin:$PATH"
export PATH

project_dir="${CLAUDE_PROJECT_DIR:-$(git -C "$(dirname "$path")" rev-parse --show-toplevel 2>/dev/null || pwd)}"
auth_dir="$project_dir/apps/dev-auth"

# No binary precondition to check: compile-flow.mjs calls @flowview/compiler,
# the WASM compiler from npm, so a plain `pnpm install` is the only setup.
# This used to gate on `command -v flowmark` and tell the user to `cargo
# install` — a requirement 1f0d3db removed. It only stayed quiet on machines
# that happened to still have the old Rust binary on PATH.
if ! output=$(cd "$auth_dir" && node scripts/compile-flow.mjs 2>&1); then
  echo "flow compile FAILED after editing $path:" >&2
  echo "$output" >&2
  exit 2
fi

exit 0
