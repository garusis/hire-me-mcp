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
# The bounded retry itself lives in scripts/biome-check.sh (see #96) so
# every Biome invocation across the repo — this hook, package.json lint
# scripts, and documented raw invocations — shares the same retry policy.
set -uo pipefail

exec "$(dirname "$0")/../biome-check.sh" check --write --staged
