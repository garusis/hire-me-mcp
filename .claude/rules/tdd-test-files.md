---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
---

# TDD Rules for Test Files

Test files are protected. `.claude/hooks/tdd-pre-edit-guard.sh` blocks (`PreToolUse`, exit 2) an
Edit/Write/MultiEdit to a `*.test.ts`/`*.test.tsx` file when the resulting content:

- Adds `it.skip(`, `test.skip(`, `describe.skip(`, `it.only(`, `test.only(`, or `describe.only(`
  that wasn't already there, or
- Removes one or more `it(`/`test(` case declarations compared to the current content, or
- Removes `expect(...)` assertions while keeping the same (or higher) number of test cases —
  i.e. a case is kept but gutted.

`.claude/hooks/tdd-pre-bash-guard.sh` separately blocks shell commands (`rm`, `git rm`, `unlink`)
that target a `*.test.ts(x)` path — deleting a test file is not a valid way to make it stop
failing.

Growing coverage (new file, new cases, new assertions) is always allowed.

When editing a test file:

- You are defining a contract, not validating an implementation. Each test covers ONE behavior
  with a descriptive name.
- Cover the happy path, edge cases, and error conditions.
- Use the project's existing patterns (Vitest — `describe`/`it`/`expect`, `vi.fn`, `vi.mock`).
- Never use `.skip()`/`.only()` in committed code.
- Never weaken an assertion to make a test pass.

If you're editing a test file *because* tests are failing after an implementation change: STOP.
Go back and fix the implementation instead — see `.claude/rules/tdd-source-files.md`. Tests only
change when the intended behavior itself changes, and that's a decision to make explicitly, not a
side effect of chasing a red run.
