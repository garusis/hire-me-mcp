# AGENTS.md

This file has two audiences, clearly separated below: an agent **exploring** this repo (a
recruiter's assistant, a curious visitor, anything just answering questions about the project) and
an agent **contributing code** to it (under this project's TDD rules). Read the section that
matches what you're doing — the orientation layer below is prose to help you answer questions
quickly, not a rulebook, and the contributor rules after the divider are the opposite.

## If you are just exploring this repo

**What this is.** `hire-me-mcp` is Marcos Alvarez's portfolio built as a queryable API instead of a
static page: one Zod-typed body of real career data (profile, work history, projects, skills)
backs a portfolio site, an embedded chat where visitors can "interview" an AI agent grounded in
that data, and a public, anonymous Model Context Protocol (MCP) server that any MCP-compatible
assistant can connect to directly and query with citations back to the source record.

### Key directories

| Path | What's there |
| --- | --- |
| `packages/career-data/content/` | Career data source of truth — profile, experience, skills, projects, and gaps as Zod-validated JSON/MDX. Everything else derives from this. |
| `packages/core/` | Framework-free domain layer — the repository and search engine over `career-data`, and the domain services (`get-profile`, `get-experience`, `search-projects`, `get-skill-evidence`) every interface below calls. |
| `packages/agent/` | The embedded Mastra interview agent (system prompt, model provider) that powers the on-site chat, plus its eval suite. |
| `apps/web/app/api/mcp/`, `apps/web/lib/mcp/` | The MCP tool implementations — registration, citation/error handling, and rate limiting that expose `packages/core`'s domain services as public MCP tools. |
| `apps/web/app/` | The Next.js 15 App Router site itself — portfolio pages, the embedded chat UI, and the MCP route above. |
| `apps/web/e2e/`, `packages/agent/src/evals/` | Tests that exercise the whole stack rather than a single unit: Playwright end-to-end specs and the Mastra eval suite that grades the chat agent's groundedness. |

(Unit tests are co-located next to the source they cover throughout the repo — see
["If you are contributing code"](#if-you-are-contributing-code) below for that convention.)

### Read this first, in order

1. This section — you're already here.
2. [`README.md`](README.md) — the pitch, and the "Connect your agent in one step" section.
3. [`docs/mcp.md`](docs/mcp.md) — the canonical MCP connection guide: per-client setup, the tool
   reference, rate limits, and troubleshooting.
4. `packages/career-data/content/` — the real data everything downstream is grounded in and cited
   against.
5. `packages/core/src/` — the domain services that read that data.
6. `apps/web/app/api/mcp/route.ts` and `apps/web/lib/mcp/` — how those services become MCP tools.

### Try this first

Don't just read the code — talk to it. Connect any MCP-capable client (Claude, Cursor, or another
Streamable HTTP client) to the live server using the copy-paste snippets in README's
["Connect your agent in one step"](README.md) section (the single place those snippets are
generated from, per #17) or the fuller [`docs/mcp.md`](docs/mcp.md), then ask something like *"Has
Marcos worked with event-driven architectures? Show me the evidence."* No API key, OAuth, or
account is required. If you'd rather watch than connect, the live `/mcp` page linked from both docs
has a demo transcript.

If you're wondering whether this orientation section actually works on a fresh session with no
other context — that's exactly what
[`docs/agent-onboarding-verification.md`](docs/agent-onboarding-verification.md) checks: two
scripted scenarios (repo URL only, site URL only), a pass/fail rubric, and a run log from
executing them for real.

### How the pieces relate

One domain model, three interfaces. `packages/career-data` is the data; `packages/core` is the
single domain layer that reads it and produces cited answers. Three separate front doors call that
same domain layer and never re-implement it: the portfolio site (`apps/web/app`), the embedded chat
agent (`packages/agent`, mounted into `apps/web`), and the public MCP server
(`apps/web/app/api/mcp`). Whichever interface you're looking at, an answer to "has he done X"
always traces back through `packages/core` to a citation in `packages/career-data/content`.

---

## If you are contributing code

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
