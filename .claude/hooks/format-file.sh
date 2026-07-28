#!/bin/sh
# PostToolUse hook: run Prettier on the file that was just edited.
#
# CI gates on `pnpm format:check`, and husky/lint-staged only formats at commit
# time — so without this the model finds out it broke formatting one full
# check cycle later. Formatting on write keeps `format:check` green throughout.
#
# Exit 0 always: formatting is a convenience, never a reason to interrupt work.
# Failures are reported on stderr but do not block.
set -eu

path=$(jq -r '.tool_input.file_path // empty' 2>/dev/null || true)
[ -n "$path" ] || exit 0
[ -f "$path" ] || exit 0

# Only the extensions listed in package.json's lint-staged globs.
case "$path" in
  *.ts | *.tsx | *.js | *.jsx | *.mjs | *.cjs | *.json | *.html | *.css | \
  *.scss | *.md | *.yml | *.yaml) ;;
  *) exit 0 ;;
esac

# Generated output — the .flow compiler owns the formatting of these.
case "$path" in
  *.flow.js) exit 0 ;;
esac

project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Respect .prettierignore rather than reformatting files the repo excludes.
if ! (cd "$project_dir" && pnpm exec prettier --ignore-unknown --write "$path" >/dev/null 2>&1); then
  echo "prettier failed on $path (left unformatted; 'pnpm format:check' may fail)" >&2
fi

exit 0
