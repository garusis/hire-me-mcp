#!/bin/bash
# PostToolUse hook (Edit | Write | MultiEdit): after an allowed edit, runs the
# nearest test file (fast feedback) and Biome check on the edited file.
#
# Non-blocking (always exits 0) — tdd-pre-edit-guard.sh is the pre-write gate
# and tdd-stop-guard.sh is the hard, session-end enforcement point. This hook
# just surfaces results quickly so Claude doesn't have to guess.
#
# Hermetic: no network. Bounded timeouts on both commands.

source "$(dirname "$0")/tdd-lib.sh"

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

if [[ "$TOOL_NAME" != "Edit" && "$TOOL_NAME" != "Write" && "$TOOL_NAME" != "MultiEdit" ]]; then
  exit 0
fi

FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
[[ -n "$FILE_PATH" ]] || exit 0

REL_PATH=$(to_repo_relative "$FILE_PATH")
CLASS=$(tdd_guard classify "$REL_PATH" 2>/dev/null)
[[ "$CLASS" == "source" || "$CLASS" == "test" ]] || exit 0

PACKAGE_DIR=$(detect_package_dir "$REL_PATH")
[[ -n "$PACKAGE_DIR" ]] || exit 0
PACKAGE_NAME=$(detect_package_name "$PACKAGE_DIR")

if [[ "$CLASS" == "test" ]]; then
  TARGET_TEST="$REL_PATH"
else
  TARGET_TEST=$(tdd_guard expected-test "$REL_PATH" 2>/dev/null)
fi

if [[ -n "$TARGET_TEST" && -f "$PROJECT_ROOT/$TARGET_TEST" ]]; then
  VITEST_BIN="$PACKAGE_DIR/node_modules/.bin/vitest"
  [[ -x "$VITEST_BIN" ]] || VITEST_BIN="$PROJECT_ROOT/node_modules/.bin/vitest"
  PKG_PREFIX="${PACKAGE_DIR#"$PROJECT_ROOT"/}/"
  REL_TEST_IN_PKG="${TARGET_TEST#"$PKG_PREFIX"}"

  if [[ -x "$VITEST_BIN" ]]; then
    echo "Running $TARGET_TEST ($PACKAGE_NAME)..." >&2
    OUTPUT=$(cd "$PACKAGE_DIR" && CI=true NO_COLOR=1 run_with_timeout 30 "$VITEST_BIN" run --reporter=dot "$REL_TEST_IN_PKG" 2>&1)
    if [[ $? -eq 0 ]]; then
      echo "PASS: $TARGET_TEST" >&2
    else
      echo "FAIL: $TARGET_TEST" >&2
      echo "$OUTPUT" | tail -25 >&2
    fi
  fi
else
  EXPECTED=$(tdd_guard expected-test "$REL_PATH" 2>/dev/null)
  [[ -n "$EXPECTED" ]] && echo "No test file yet at $EXPECTED — tdd-pre-edit-guard.sh will require it before further source edits." >&2
fi

# Biome check on just the edited file — fast, cacheable, catches
# lint/format issues immediately instead of at Stop.
BIOME_BIN="$PROJECT_ROOT/node_modules/.bin/biome"
if [[ -x "$BIOME_BIN" && -f "$PROJECT_ROOT/$REL_PATH" ]]; then
  BIOME_OUTPUT=$(cd "$PROJECT_ROOT" && run_with_timeout 20 "$BIOME_BIN" check "$REL_PATH" 2>&1)
  if [[ $? -ne 0 ]]; then
    echo "Biome check failed for $REL_PATH:" >&2
    echo "$BIOME_OUTPUT" | tail -20 >&2
  fi
fi

exit 0
