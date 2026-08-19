#!/usr/bin/env bash
# Runs Biome against staged files for the lefthook pre-commit "biome" job.
#
# Why --staged and not a raw file list:
#   `biome check <file...>` invoked with an explicit path list from the repo
#   root is the invocation documented (biomejs/biome#6400-class reports) to
#   occasionally crash Biome 2.5.9's worker/daemon process with exit 254
#   ("Linter process terminated abnormally (possibly out of memory)") even
#   though the same files check cleanly via `biome check .` or a
#   turbo-scoped `biome check .` inside a package directory. `--staged` is
#   Biome's own purpose-built flag for this exact use case (it resolves the
#   staged file set itself via the same VCS integration `biome check .`
#   already uses) and was the most reliable invocation we measured, but the
#   underlying daemon crash is still an intermittent process-spawn flake,
#   not a lint failure (`exit 1` is a real diagnostic; `exit 254` is not).
#
# The crash never partially applies fixes, so retrying is safe: either the
# process crashed before writing anything, or it completed and returned a
# normal exit code. Retrying only masks the *infra* flake; a genuine lint
# or format violation still fails the commit on the very first attempt.
set -uo pipefail

max_attempts=3
attempt=1

while true; do
  pnpm exec biome check --write --staged
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
