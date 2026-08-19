---
paths:
  - "apps/*/src/**/*.ts"
  - "apps/*/src/**/*.tsx"
  - "apps/*/app/**/*.ts"
  - "apps/*/app/**/*.tsx"
  - "packages/*/src/**/*.ts"
  - "packages/*/src/**/*.tsx"
---

# TDD Rules for Source Code

This repo enforces **test-first**, not just "has tests". `.claude/hooks/tdd-pre-edit-guard.sh`
blocks (`PreToolUse`, exit 2) any Edit/Write/MultiEdit to a file matching the globs above unless:

1. A co-located test file exists — `src/foo.ts` -> `src/foo.test.ts` (the #13 convention;
   `apps/web` mirrors it under `app/` since that's where its source lives), **and**
2. That test file currently **fails** when run.

The block message names the exact expected test path. If it's missing, create it first with a
failing test that specifies the new behavior; if it exists and passes, add a failing case for the
change you're about to make.

Before editing any enforced source file:

1. Identify (or create) the co-located test file.
2. Read it to understand the behavior it demands.
3. Run it: `pnpm --filter <package> test` (or `pnpm turbo test --filter=<package>`).
4. If it's not red yet, write the failing test first.
5. Only then edit the source file, and re-run the test until it's green.

Do NOT:

- Add error handling for scenarios no test exercises.
- Add functionality not demanded by a failing test.
- Modify a test file to make an implementation pass — that's covered by
  `.claude/rules/tdd-test-files.md` and is separately blocked.

## Escape hatch

`TDD_SKIP_GUARD=1` (set as an environment variable for the single command) skips this hook. This
is for genuine exceptions (e.g. a pure mechanical rename across many files where writing a
failing test first doesn't make sense) — not a way to routinely bypass test-first. Layer 3
(lefthook pre-commit, #18) and CI still enforce a green suite regardless of whether this hook ran.

## What "the affected package" means

The hook maps a file to its workspace package by walking up to the nearest `package.json` whose
`name` isn't the workspace root (`apps/web`, `packages/core`, `packages/career-data`,
`tooling/tdd-guard`). Tests run with that package's own `vitest` — see
`.claude/hooks/tdd-lib.sh`.
