#!/bin/bash
# PreToolUse hook (Bash): blocks shell commands that delete a protected test
# file (rm/git rm targeting *.test.ts(x)). Complements tdd-pre-edit-guard.sh,
# which only sees Edit/Write/MultiEdit tool calls and would otherwise miss a
# test file removed via `rm` or `git rm`.
#
# Hermetic: pure string scanning of the proposed command, no execution, no
# network. Fails open (allows) on anything it can't confidently classify —
# this hook exists to catch an obvious bypass, not to sandbox Bash.
#
# Exit 0 = allow. Exit 2 = block (stderr shown to Claude as the reason).

source "$(dirname "$0")/tdd-lib.sh"

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

if [[ "$TOOL_NAME" != "Bash" ]]; then
  exit 0
fi

if is_guard_skipped; then
  exit 0
fi

COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
if [[ -z "$COMMAND" ]]; then
  exit 0
fi

# Only look at commands that look like a deletion (rm, git rm, unlink) — cheap
# pre-filter before invoking node for every Bash call.
if [[ ! "$COMMAND" =~ (^|[[:space:];&|])(rm|git[[:space:]]+rm|unlink)[[:space:]] ]]; then
  exit 0
fi

BLOCKED=0
BLOCK_REASON=""

# Extract candidate file arguments: whitespace-separated tokens ending in
# .test.ts or .test.tsx, ignoring flags (leading -).
for TOKEN in $COMMAND; do
  case "$TOKEN" in
    -*) continue ;;
    *.test.ts|*.test.tsx)
      CANDIDATE="${TOKEN%\'}"
      CANDIDATE="${CANDIDATE#\'}"
      CANDIDATE="${CANDIDATE%\"}"
      CANDIDATE="${CANDIDATE#\"}"
      REL_PATH=$(to_repo_relative "$CANDIDATE")
      RESULT=$(tdd_guard pre-delete "$REL_PATH" 2>/dev/null)
      DECISION=$(echo "$RESULT" | jq -r '.decision // "allow"' 2>/dev/null)
      if [[ "$DECISION" == "block" ]]; then
        BLOCKED=1
        BLOCK_REASON=$(echo "$RESULT" | jq -r '.reason')
      fi
      ;;
  esac
done

if [[ $BLOCKED -eq 1 ]]; then
  echo "$BLOCK_REASON" >&2
  echo "If this command is meant to run other, unrelated deletions too, split it up and run those separately." >&2
  exit 2
fi

exit 0
