#!/bin/bash
# Shared utilities for the TDD-enforcement hooks (#22).
# Source from other hooks: source "$(dirname "$0")/tdd-lib.sh"
#
# Design: all allow/block *decisions* live in tooling/tdd-guard (TypeScript,
# covered by Vitest). These hooks only gather repo state (does a test file
# exist, is it failing, what changed) and shell out to `tdd_guard` for the
# verdict — see .claude/rules/tdd-source-files.md and tdd-test-files.md.

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TDD_GUARD_CLI="$PROJECT_ROOT/tooling/tdd-guard/src/cli.ts"
TSX_BIN="$PROJECT_ROOT/node_modules/.bin/tsx"

# Runs the tdd-guard CLI hermetically: local tsx binary only, no network,
# no package manager resolution (no `npx`/`pnpm dlx`).
tdd_guard() {
  if [[ ! -x "$TSX_BIN" ]]; then
    echo "tdd-guard: $TSX_BIN not found — run 'pnpm install' at the repo root." >&2
    return 127
  fi
  "$TSX_BIN" "$TDD_GUARD_CLI" "$@"
}

# Runs "$@" with a bounded wall-clock timeout (seconds), portable to macOS
# bash (no dependency on GNU coreutils' `timeout`).
run_with_timeout() {
  local timeout_secs="$1"
  shift
  "$@" &
  local cmd_pid=$!
  (
    sleep "$timeout_secs"
    kill -9 "$cmd_pid" 2>/dev/null
  ) &
  local watcher_pid=$!
  wait "$cmd_pid" 2>/dev/null
  local status=$?
  kill "$watcher_pid" 2>/dev/null
  wait "$watcher_pid" 2>/dev/null
  return $status
}

# Converts an absolute or repo-relative path to a repo-relative, POSIX path.
to_repo_relative() {
  local file_path="$1"
  case "$file_path" in
    "$PROJECT_ROOT"/*) echo "${file_path#"$PROJECT_ROOT"/}" ;;
    /*) echo "$file_path" ;; # absolute but outside the repo — leave as-is
    *) echo "$file_path" ;;
  esac
}

# Finds the workspace package directory (absolute) containing a repo-relative
# file path, by walking up to the nearest package.json whose name isn't the
# workspace root.
detect_package_dir() {
  local repo_relative_path="$1"
  local dir="$PROJECT_ROOT/$(dirname "$repo_relative_path")"

  while [[ "$dir" != "$PROJECT_ROOT" && "$dir" != "/" ]]; do
    if [[ -f "$dir/package.json" ]]; then
      local pkg_name
      pkg_name=$(jq -r '.name // empty' "$dir/package.json" 2>/dev/null)
      if [[ -n "$pkg_name" && "$pkg_name" != "hire-me-mcp" ]]; then
        echo "$dir"
        return 0
      fi
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

detect_package_name() {
  local package_dir="$1"
  jq -r '.name // empty' "$package_dir/package.json" 2>/dev/null
}

is_guard_skipped() {
  [[ "${TDD_SKIP_GUARD:-0}" == "1" ]]
}
