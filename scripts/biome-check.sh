#!/usr/bin/env bash
# Shared bounded-retry wrapper around `pnpm exec biome`.
#
# Biome 2.5.9's linter worker/daemon process intermittently crashes with
# exit 254 ("Linter process terminated abnormally (possibly out of
# memory)") — a process-spawn flake reported in #96, not a lint failure.
# It reproduces on macOS (Apple Silicon) with both single-file and
# full-repo invocations; CI (Linux runners) has never flaked. As of 2.5.9
# (the latest published 2.x release at the time of investigation) there is
# no newer patch to upgrade to and no matching upstream Biome issue with a
# confirmed fix, so this wrapper is the mitigation: retry only the exit-254
# infra flake, never a real diagnostic.
#
# The crash never partially applies fixes, so retrying is safe: either the
# process crashed before writing anything, or it completed and returned a
# normal exit code. `exit 1` (real lint/format violations) is never
# retried — it fails on the very first attempt, same as running biome
# directly.
#
# Usage: scripts/biome-check.sh <biome subcommand and args...>
#   scripts/biome-check.sh check .
#   scripts/biome-check.sh check --write --staged
#   scripts/biome-check.sh format --write .
#
# Runs in the caller's current working directory (does not cd), so it works
# the same whether invoked from the repo root or from a package directory.
set -uo pipefail

max_attempts=3
attempt=1

while true; do
  pnpm exec biome "$@"
  status=$?

  if [ "$status" -eq 0 ]; then
    exit 0
  fi

  if [ "$status" -ne 254 ] || [ "$attempt" -ge "$max_attempts" ]; then
    exit "$status"
  fi

  echo "biome: worker process crashed (exit 254), retrying (${attempt}/${max_attempts})..." >&2
  attempt=$((attempt + 1))
done
