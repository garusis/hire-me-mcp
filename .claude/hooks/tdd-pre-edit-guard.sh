#!/bin/bash
# PreToolUse hook (Edit | Write | MultiEdit): enforces test-first development.
#
# - Editing/creating an enforced source file (apps/*/{src,app}/**/*.ts(x),
#   packages/*/src/**/*.ts(x), excluding *.test.ts(x) and config files) is
#   blocked unless its co-located test file exists AND currently fails.
# - Editing a test file that would weaken it (.skip/.only added, test cases
#   or assertions removed) is blocked.
# - Everything else (docs, config, new test files, growing test coverage) is
#   allowed.
#
# Hermetic: no network. Bounded timeout on the single vitest run it performs.
# Escape hatch: TDD_SKIP_GUARD=1 skips this hook entirely (documented,
# exceptional use only — see .claude/rules/tdd-source-files.md).
#
# Exit 0 = allow (tool proceeds). Exit 2 = block (Claude Code shows stderr as
# the block reason and does not run the tool).

set -o pipefail

source "$(dirname "$0")/tdd-lib.sh"

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

if [[ "$TOOL_NAME" != "Edit" && "$TOOL_NAME" != "Write" && "$TOOL_NAME" != "MultiEdit" ]]; then
  exit 0
fi

if is_guard_skipped; then
  echo "tdd-pre-edit-guard: TDD_SKIP_GUARD=1 — skipping (exceptional use only)." >&2
  exit 0
fi

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

REL_PATH=$(to_repo_relative "$FILE_PATH")
CLASS=$(tdd_guard classify "$REL_PATH" 2>/dev/null)
if [[ -z "$CLASS" ]]; then
  # tdd-guard itself failed to run (e.g. missing tsx) — fail open, don't brick edits.
  exit 0
fi

TOOL_INPUT=$(echo "$INPUT" | jq -c '.tool_input // {}')

if [[ "$CLASS" == "other" ]]; then
  exit 0
fi

OLD_CONTENT=""
ABS_PATH="$PROJECT_ROOT/$REL_PATH"
if [[ -f "$ABS_PATH" ]]; then
  OLD_CONTENT=$(cat "$ABS_PATH")
fi

if [[ "$CLASS" == "test" ]]; then
  PAYLOAD=$(jq -n \
    --arg toolName "$TOOL_NAME" \
    --arg filePath "$REL_PATH" \
    --arg oldContent "$OLD_CONTENT" \
    --argjson toolInput "$TOOL_INPUT" \
    '{toolName: $toolName, filePath: $filePath, oldContent: $oldContent, toolInput: $toolInput}')
  RESULT=$(echo "$PAYLOAD" | tdd_guard pre-edit)
  DECISION=$(echo "$RESULT" | jq -r '.decision // "allow"')
  REASON=$(echo "$RESULT" | jq -r '.reason // "tdd-guard produced no reason"')
  if [[ "$DECISION" == "block" ]]; then
    echo "$REASON" >&2
    exit 2
  fi
  exit 0
fi

# CLASS == "source": determine whether the mapped test file exists and
# whether it currently fails.
EXPECTED_TEST=$(tdd_guard expected-test "$REL_PATH" 2>/dev/null)
TEST_EXISTS="false"
TEST_FAILING="null"

if [[ -n "$EXPECTED_TEST" && -f "$PROJECT_ROOT/$EXPECTED_TEST" ]]; then
  TEST_EXISTS="true"
  PACKAGE_DIR=$(detect_package_dir "$REL_PATH")
  if [[ -n "$PACKAGE_DIR" ]]; then
    VITEST_BIN="$PACKAGE_DIR/node_modules/.bin/vitest"
    [[ -x "$VITEST_BIN" ]] || VITEST_BIN="$PROJECT_ROOT/node_modules/.bin/vitest"
    # Strip the package's own prefix (e.g. "packages/core/") to get a path
    # relative to $PACKAGE_DIR.
    PKG_PREFIX="${PACKAGE_DIR#"$PROJECT_ROOT"/}/"
    REL_TEST_IN_PKG="${EXPECTED_TEST#"$PKG_PREFIX"}"

    if [[ -x "$VITEST_BIN" ]]; then
      (
        cd "$PACKAGE_DIR" || exit 125
        CI=true NO_COLOR=1 run_with_timeout 30 "$VITEST_BIN" run --reporter=dot "$REL_TEST_IN_PKG"
      ) >/tmp/tdd-pre-edit-guard.$$.log 2>&1
      VITEST_EXIT=$?
      rm -f "/tmp/tdd-pre-edit-guard.$$.log"
      if [[ $VITEST_EXIT -eq 0 ]]; then
        TEST_FAILING="false"
      elif [[ $VITEST_EXIT -eq 125 ]]; then
        TEST_FAILING="null"
      else
        TEST_FAILING="true"
      fi
    fi
  fi
fi

PAYLOAD=$(jq -n \
  --arg toolName "$TOOL_NAME" \
  --arg filePath "$REL_PATH" \
  --argjson testFileExists "$TEST_EXISTS" \
  --argjson testFileIsFailing "$TEST_FAILING" \
  '{toolName: $toolName, filePath: $filePath, testFileExists: $testFileExists, testFileIsFailing: $testFileIsFailing}')
RESULT=$(echo "$PAYLOAD" | tdd_guard pre-edit)
DECISION=$(echo "$RESULT" | jq -r '.decision // "allow"')
REASON=$(echo "$RESULT" | jq -r '.reason // "tdd-guard produced no reason"')

if [[ "$DECISION" == "block" ]]; then
  echo "$REASON" >&2
  exit 2
fi

exit 0
