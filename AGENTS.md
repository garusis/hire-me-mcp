# AGENTS.md

Instructions for Codex and any other coding agent working in this repo. Claude Code additionally
enforces the same rules mechanically via `.claude/hooks` — see "Three layers of enforcement"
below for why both exist and why bypassing one still fails at the next.

## Workspace

A pnpm + Turborepo monorepo. Node >= 20, pnpm 10 (pinned via `packageManager` in the root
`package.json`).

```
apps/
  web/              Next.js 15 App Router app (site, chat, and — later — the MCP endpoint)
packages/
  core/             Framework-free domain layer, consumed by apps/web
  career-data/      Zod-typed career content
tooling/
  tdd-guard/        Source<->test path mapping + TDD allow/block decision logic (used by .claude/hooks)
```

`apps/web` depends on `packages/core` and `packages/career-data` via the `workspace:*` protocol —
never relative `../../packages/...` imports or `tsconfig` path hacks.

## Canonical commands

Run from the repo root before considering any change done:

```bash
pnpm turbo lint typecheck test build
```

Per-package equivalents (`pnpm --filter <package> <script>`) exist for faster iteration; the
turbo pipeline is what CI and the Stop hook actually check.

## Test-first development

**Every enforced source file must have a co-located test that fails before you touch the
implementation.** "Enforced source file" means `apps/*/src/**/*.ts(x)`, `apps/*/app/**/*.ts(x)`,
and `packages/*/src/**/*.ts(x)` — not config files (`*.config.ts`, `tsconfig.json`), not `*.d.ts`,
not docs.

The test file convention (fixed in #13) is co-located and deterministic — no path translation, no
parallel `tests/` tree:

```
src/foo.ts       -> src/foo.test.ts
app/page.tsx     -> app/page.test.tsx
```

Workflow:

1. Before editing `src/foo.ts`, find or create `src/foo.test.ts`.
2. Read it (or write it) so it specifies the behavior you're about to build/change, and confirm it
   currently **fails**: `pnpm --filter <package> test`.
3. Only then edit the source file, iterating until the test is green.
4. Don't add behavior, error handling, or edge-case logic that no test demands.

Full detail: `.claude/rules/tdd-source-files.md`.

## Protected tests

Test files (`**/*.test.ts`, `**/*.test.tsx`) define the contract, not a rubber stamp on whatever
the implementation currently does. Don't:

- Delete a test file, or delete/comment-out individual assertions or cases, to make a suite go
  green.
- Add `.skip(...)` or `.only(...)` to a test in code you commit.
- Loosen an assertion (e.g. `toBe(3)` -> `toBeGreaterThan(0)`) just because the exact value
  changed and you didn't want to think about why.

If tests fail after an implementation change and your instinct is to edit the test: stop, and
check whether the *implementation* is wrong instead. Tests only change when the intended behavior
itself changes, and that's a decision to make explicitly. Full detail:
`.claude/rules/tdd-test-files.md`.

## Quality bar

- **Biome is the only linter/formatter** (`pnpm lint`, `pnpm format`) — no ESLint, no Prettier.
  `noExplicitAny`, unused imports/variables, and cognitive-complexity limits are `error`, not
  `warn`.
- **TypeScript `strict: true`** everywhere, via the shared `tsconfig.base.json`.
- **No default exports**, except Next.js App Router files that require them and config files
  (already carved out in `biome.json`).
- Small, focused commits with conventional messages referencing the issue they implement.

Full detail: `.claude/rules/quality-bar.md`.

## Architecture boundaries

`packages/core` stays framework-free — no React, no Next.js, no HTTP-framework dependencies. It's
the domain layer that will also back the future public MCP endpoint. Anything that only makes
sense inside a specific runtime belongs in `apps/web`. Full detail:
`.claude/rules/architecture-boundaries.md`.

## Three layers of enforcement

Don't confuse these — they overlap on purpose:

1. **`.claude/hooks` + `.claude/rules` (Claude Code only).** `PreToolUse` hooks block a
   non-test-first source edit or a test-weakening edit *before it's written*; a `PostToolUse` hook
   runs the nearest test after every edit for fast feedback; a `Stop` hook blocks ending a session
   with a red suite or dirty lint. This is real-time, in-editor enforcement, but only for Claude
   Code — it does not run for Codex or a human committing from the terminal.
2. **`AGENTS.md` (this file).** Instruction-level mirror of the same rules for Codex and any other
   agent that reads `AGENTS.md` natively. This is persuasion, not enforcement — nothing stops an
   agent (or a human) from ignoring it.
3. **lefthook pre-commit + CI (tool-agnostic, binds everyone).** A pre-commit hook (tracked in
   #18; not yet present in this repo — until it lands, this layer is CI-only) and CI both run
   `pnpm turbo lint typecheck test build` regardless of which agent, editor, or human produced the
   commit.

So: bypassing layer 1 (e.g. because you're Codex, or because `TDD_SKIP_GUARD=1` was set for a
documented exception) does not mean the change ships broken — layer 3 still runs the full
`lint typecheck test build` pipeline and fails the commit/PR if it's red. Layer 1 exists purely to
give fast, in-the-loop feedback so you don't get to layer 3 and discover the problem late.
