#!/bin/bash
# Stop hook: the hard enforcement point. Blocks ending the session if the
# working tree has a red test suite or a dirty (failing) lint state in any
# package touched this session.
#
# Scope: packages affected by uncommitted changes (git diff against HEAD,
# staged + unstaged). If nothing changed, or nothing changed under an
# enforced package, this is a no-op.
#
# Hermetic: no network. Bounded timeout per package. Exit 2 blocks stopping
# (Claude Code shows stderr and the session continues); exit 0 allows it.

source "$(dirname "$0")/tdd-lib.sh"

cd "$PROJECT_ROOT" || exit 0

# Claude Code sets stop_hook_active=true when it's re-invoking Stop after a
# previous block already forced a continuation. Never block a second time in
# the same turn — that would deadlock the session.
INPUT=$(cat)
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null)
if [[ "$STOP_HOOK_ACTIVE" == "true" ]]; then
  exit 0
fi

if is_guard_skipped; then
  echo "tdd-stop-guard: TDD_SKIP_GUARD=1 — skipping (exceptional use only)." >&2
  exit 0
fi

CHANGED_FILES=$(git diff --name-only HEAD 2>/dev/null; git diff --cached --name-only 2>/dev/null; git ls-files --others --exclude-standard 2>/dev/null)
ALL_CHANGED=$(echo "$CHANGED_FILES" | sort -u | grep -E '\.(ts|tsx)$')

[[ -n "$ALL_CHANGED" ]] || exit 0

declare -A PACKAGE_DIRS
while IFS= read -r file; do
  [[ -n "$file" ]] || continue
  PKG_DIR=$(detect_package_dir "$file")
  [[ -n "$PKG_DIR" ]] && PACKAGE_DIRS["$PKG_DIR"]=1
done <<< "$ALL_CHANGED"

[[ ${#PACKAGE_DIRS[@]} -gt 0 ]] || exit 0

FAILED=0
FAILED_PKGS=()

for pkg_dir in "${!PACKAGE_DIRS[@]}"; do
  PKG_NAME=$(detect_package_name "$pkg_dir")
  VITEST_BIN="$pkg_dir/node_modules/.bin/vitest"
  [[ -x "$VITEST_BIN" ]] || VITEST_BIN="$PROJECT_ROOT/node_modules/.bin/vitest"

  echo "Verifying tests for $PKG_NAME..." >&2
  if [[ -x "$VITEST_BIN" ]]; then
    OUTPUT=$(cd "$pkg_dir" && CI=true NO_COLOR=1 run_with_timeout 45 "$VITEST_BIN" run 2>&1)
    if [[ $? -ne 0 ]]; then
      FAILED=1
      FAILED_PKGS+=("$PKG_NAME (tests)")
      echo "FAIL: $PKG_NAME tests" >&2
      echo "$OUTPUT" | tail -20 >&2
    else
      echo "PASS: $PKG_NAME tests" >&2
    fi
  fi

  BIOME_BIN="$PROJECT_ROOT/node_modules/.bin/biome"
  if [[ -x "$BIOME_BIN" ]]; then
    REL_PKG_DIR="${pkg_dir#"$PROJECT_ROOT"/}"
    LINT_OUTPUT=$(cd "$PROJECT_ROOT" && run_with_timeout 20 "$BIOME_BIN" check "$REL_PKG_DIR" 2>&1)
    if [[ $? -ne 0 ]]; then
      FAILED=1
      FAILED_PKGS+=("$PKG_NAME (lint)")
      echo "FAIL: $PKG_NAME lint" >&2
      echo "$LINT_OUTPUT" | tail -20 >&2
    else
      echo "PASS: $PKG_NAME lint" >&2
    fi
  fi
done

if [[ $FAILED -ne 0 ]]; then
  echo "" >&2
  echo "BLOCKED: cannot end the session — failing in: ${FAILED_PKGS[*]}." >&2
  echo "Fix failing tests / lint before finishing, or set TDD_SKIP_GUARD=1 for a documented exception." >&2
  exit 2
fi

echo "All affected packages: tests passing, lint clean." >&2
exit 0
