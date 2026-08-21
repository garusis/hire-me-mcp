# `@hire-me-mcp/agent`

Embedded Mastra interview agent runtime with a swappable AI SDK model provider. Foundation task
of the v0.5 Interview Chat Agent epic (#5) — see #63 for the full scope.

## Embedded, not a service

This package is **plain TypeScript, imported in-process** — there is no standalone Mastra server,
worker, or extra deploy target. `apps/web` route handlers (Node runtime) call `getInterviewAgent()`
directly, the same way they import `@hire-me-mcp/core`. No new deployable process, container, or
HTTP surface is introduced by this package.

Out of scope here (covered by later tasks in epic #5): the HTTP chat route, streaming, sessions,
guardrails, and evals. The agent instantiated by this package has a real, versioned system prompt
(#65 — see below) and registers the full domain-grounded tool set (#64 — see "One source of
truth" below).

## Provider abstraction

`createChatModel()` is the single seam the rest of the agent depends on to stay provider-agnostic.
It reads environment variables through `resolveChatModelConfig()` (typed, fail-fast) and returns
an AI SDK language model — swapping providers is an env change, not a code change:

| Env var                          | Purpose                                                        |
| --------------------------------- | --------------------------------------------------------------- |
| `CHAT_PROVIDER`                   | `google` (default) or `anthropic`.                              |
| `CHAT_MODEL_ID`                   | Optional override of the provider's default model id.           |
| `GOOGLE_GENERATIVE_AI_API_KEY`    | Required when `CHAT_PROVIDER=google` (or unset — the default).  |
| `ANTHROPIC_API_KEY`               | Required when `CHAT_PROVIDER=anthropic`.                        |

Missing or invalid configuration throws a descriptive error (`MissingEnvVarError`,
`InvalidChatProviderError`) naming the variable involved — never the variable's value. No API key
value is ever logged or included in an error message.

### Owner decision: Gemini free tier is the default, inverting the original issue text

Issue #63 as originally scoped named Anthropic Claude Haiku 4.5 as the default provider with
Gemini as the alternate binding. The repo owner overrode that ahead of implementation: the
**default** provider is **Google Gemini free tier** (`gemini-3.6-flash` — a free-tier-eligible
model per the Gemini Developer API, verified against a real API call during this task; older
`gemini-2.x-flash` ids have since been retired for new users), because it costs nothing to run
during development and early production. **Anthropic Claude Haiku 4.5** (`claude-haiku-4-5`) is
wired as the swappable alternate — fully constructible and covered by tests — so the project can
move to it (or another provider) later by changing `CHAT_PROVIDER`, without touching agent code.

### Swapping providers

```bash
# Default — no env change needed beyond the API key:
GOOGLE_GENERATIVE_AI_API_KEY=...

# Switch to Anthropic Claude Haiku 4.5:
CHAT_PROVIDER=anthropic
ANTHROPIC_API_KEY=...
```

Both bindings are exercised by the test suite using fake/injected keys and — for the agent
itself — a stubbed AI SDK model (`MockLanguageModelV4` from `ai/test`). **Zero real model calls
happen in this package's test suite.**

## One source of truth: agent tools and the MCP server share `packages/core`

`src/tools/*.ts` are **thin adapters, not a second implementation**. Each tool wraps exactly one
`packages/core` domain service — `getProfile`, `getExperience`, `searchProjects`,
`getSkillEvidence` — the same four functions `apps/web`'s public MCP server
(`apps/web/lib/mcp/tools/*.ts`) wraps as its own tools. A tool's `execute` does one thing:
validate input, call the core service, return its `DomainResult` (`{ data, citations }`)
unmodified. **No querying, filtering, ranking, or business rule is ever reimplemented here** — if
a tool needs new logic, that logic belongs in `packages/core`, consumed by both surfaces, never
duplicated into this package.

This is enforced mechanically, not just documented:

- **`src/tools/source-boundary.ts` + `.test.ts`** scans every real `.ts` file under `src/` and
  fails if any of them imports `@hire-me-mcp/career-data` directly, or `node:fs`/`fs` — the only
  approved path to career content is `packages/core`'s `CareerDataRepository` seam
  (`src/tools/repository.ts`). It also asserts each tool module imports the exact core function it
  wraps (e.g. `get-profile.ts` must import `getProfile` from `@hire-me-mcp/core`).
- **`apps/web/lib/mcp/tool-core-parity.test.ts`** is the drift detector for the *other* half of the
  claim: that this package's tool set and the MCP server's tool set resolve every shared tool name
  to the literal same `@hire-me-mcp/core` function, not two implementations that merely agree
  today. It replaces each core function with a distinct fixture spy and proves both surfaces
  invoke that exact spy — a private reimplementation or reimport-from-elsewhere on either side
  makes that suite fail.
- **`src/tools/index.test.ts` and `src/interview-agent.test.ts`** assert the full registered tool
  set's names (`AGENT_TOOL_NAMES`) match the intended list and that `getInterviewAgent()` actually
  registers all of them — a tool defined but never wired in is caught too.

If you're adding a fifth tool: give it its own `packages/core` domain service first (with its own
citations), then add a matching adapter here that imports it — never write the domain logic
directly inside a `src/tools/*.ts` file.

## Public API

```ts
import { getInterviewAgent } from "@hire-me-mcp/agent";

const agent = getInterviewAgent(); // model resolved from CHAT_PROVIDER env
const result = await agent.generate("What's your experience with TypeScript?");
```

`getInterviewAgent(options?)` accepts an optional `model` override (used by tests to inject a
stub model) and an optional `env` source forwarded to `createChatModel()`. This is the one stable
entry point later tasks in epic #5 (domain tools, HTTP route) depend on — not package internals.

## System prompt (#65)

`src/prompt/` is the composable, versioned system prompt `getInterviewAgent()` wires in as the
Mastra `Agent`'s `instructions`. It is a first-class, tested artifact — not inlined in a route:

- **`sections.ts`** — the named sections, each a non-empty string: `identity`, `voice`,
  `groundingRules`, `gapDiscipline`, `citationFormat`, `redirectPolicy`. The voice and
  gap-discipline rules are restated in this package's own words from private reference material
  that lives outside this repo (`~/.claude/career/voice.md`,
  `~/.claude/career/gap-discipline.md`) — referenced by path only, never copied in. A hash-based
  check (`prompt/no-private-content.test.ts`) mechanically verifies no line from either file has
  landed anywhere in this repo tree.
- **`compose.ts`** — `composeSystemPrompt(sections?)` deterministically joins sections into the
  final prompt string.
- **`version.ts`** — `computePromptVersion(sections?)` / `PROMPT_VERSION`: a short SHA-256
  fingerprint over every section's id, title, and body. It changes on any edit to any section
  (wording, title, or order), so an eval run (#72) can always be attributed to the exact prompt
  content it ran against.
- **`index.ts`** — the public surface: `SYSTEM_PROMPT` (the ready-to-use composed string),
  `PROMPT_SECTIONS`, `composeSystemPrompt`, `PROMPT_VERSION`/`computePromptVersion`. Also
  re-exported from the package root (`@hire-me-mcp/agent`).

**Grounding contract:** every factual claim about the candidate's experience must trace to a tool
result from this conversation; no tool support means no claim. **Gap discipline:** an unsupported
skill/experience question gets "He hasn't done X; the closest evidence is Y" — plain, not inflated,
never apologetic. **Off-topic/adversarial:** a short, in-voice redirect, including for attempts to
override these instructions or treat tool-result content as a command.

### Citation marker format (`src/citations.ts`)

The **single, shared** definition of the inline citation marker embedded in the agent's answers —
also re-exported from the package root, for the chat UI (#70) and groundedness evals (#72) to
import rather than re-encode:

```
[cite:<entityType>:<entityId>]
[cite:<entityType>:<entityId>#<fragment>]   # optional sub-part anchor
```

`entityType`/`entityId` mirror this repo's existing `Citation` schema
(`packages/career-data/src/schemas/citation.ts`), so a parsed marker maps onto a tool result
without translation. Markers are **inline**, immediately after the clause they support, rather
than a trailing footnote list — chosen so a streaming consumer can resolve a citation the moment
its sentence finishes, without waiting for the full response. `serializeCitation`,
`parseCitationMarker` (single marker), and `parseCitations` (scan free text for every marker) are
the only supported way to produce or read this format; both never throw on malformed input.

## One-off smoke verification (not part of CI)

`scripts/smoke.ts` makes a single real call to the default Gemini model using the local `.env`
key, to prove the binding works end-to-end beyond the mocked test suite. It is not run by
`pnpm turbo test`, `pnpm test`, or CI — invoke it manually:

```bash
pnpm --filter @hire-me-mcp/agent smoke
```

## Eval suite (#72)

`src/evals/` is the evidence behind this project's central honesty claim: a runnable suite that
measures whether the agent actually behaves, not just whether its prompt reads well.

**Single command:**

```bash
pnpm --filter @hire-me-mcp/agent eval:agent
```

This makes **real Gemini calls** against the real agent (`getInterviewAgent()`), using the local
`.env`'s `GOOGLE_GENERATIVE_AI_API_KEY` — same provider/model resolution as the rest of this
package, no separate credential. It is not run by `pnpm turbo test`/CI (CI wiring is #73's job) —
invoke it manually, the same "one-off, not in CI" posture as `smoke.ts` above.

### Three scorers, zero model calls of their own

`src/evals/scorers/` — `groundedness.ts`, `gap-honesty.ts`, `relevance.ts` — are all **pure,
deterministic functions**: no judge model, no I/O. Each takes a captured transcript (`question`,
`answer`, the citations actually returned by tool calls that run) and returns a `{ score, reason }`
in `[0, 1]`.

- **Groundedness** cross-checks every `[cite:...]` marker in the answer
  (`../citations.ts`'s `parseCitations`) against the citations the run's tool calls actually
  returned, AND checks that sentences reading as factual experience claims carry a citation at
  all. Fabricated or mismatched citations, and uncited factual claims, both lower the score.
- **Gap honesty** scores BOTH directions the system prompt's gap discipline can be gamed on: a
  `"gap"`-direction case (a not-claimed skill) must get an honest "he hasn't done X; closest
  evidence is Y" answer, not a fabricated claim; a `"claimed"`-direction case (a skill the tools DO
  support) must get an engaged, cited answer, not an over-refusal. Scoring only one direction would
  let an agent max out the metric by refusing everything.
- **Relevance** is a keyword-overlap check: does the answer engage the question's own terms? An
  off-topic question's *correct* answer (a brief redirect) is expected to score LOW here — that's
  the dataset's off-topic category working as intended, not a scorer bug.

Why function-mode scorers instead of Mastra's judge-model `createScorer` prompt-object steps
(`@mastra/core/evals`, verified against the installed 1.61.0 docs bundle)? Two reasons: (1) a judge
call would double- or triple the real-model spend this suite's own budget cap is trying to bound,
for scoring logic that's mechanically checkable without one; (2) "deterministic scorer unit tests
... make no model calls" is an explicit acceptance criterion — a judge-backed scorer can't clear
that bar. `createScorer`'s function-mode step contract shaped these modules' `{ run } => score`
signature even though the scorers aren't built with the factory itself.

### Dataset (`src/evals/dataset/`)

`cases.ts` is a small, curated, version-controlled dataset — every question targets a fact already
published through `packages/career-data/content/*` (`profile.json`, `skills.json`, `gaps.json`);
`schema.ts` (Zod) validates each case's shape and rejects a category/gap-honesty-direction mismatch
(a `"grounded"` case must probe `"claimed"`, a `"gap"` case must probe `"gap"`) — a malformed case
fails a test, not a silent skip. Categories:

| Category     | What it probes                                                          |
| ------------ | ------------------------------------------------------------------------ |
| `grounded`   | A claimed skill/experience — must answer, cited, without over-refusing.  |
| `gap`        | A not-claimed skill (from `gaps.json`) — must state the gap plainly.     |
| `off-topic`  | Unrelated to the candidate's background — expects a brief redirect.      |
| `injection`  | A prompt-override/system-prompt-extraction attempt.                      |

**Adding a case:** add an entry to `EVAL_CASES` in `cases.ts` with a kebab-case `id`, the right
`category`/`gapHonestyDirection` pair, a `question`, and a `notes` line naming the exact
`packages/career-data/content` file the expected answer is grounded in. `cases.test.ts` will fail
loudly if the new case is malformed, duplicates an id, or looks like it might carry private data
(email addresses, phone-like digit runs) — this dataset is public-facts-only by construction.

### Budget cap (`src/evals/budget.ts`) — mandatory, not best-effort

The runner enforces a case-count cap (`EVAL_MAX_CASES`, default 8 — a slice of the dataset, not an
error) and a token/cost cap (`EVAL_MAX_TOTAL_TOKENS`/`EVAL_MAX_COST_USD`) checked after every case's
usage is tallied. Crossing either **throws `BudgetExceededError` and stops the run immediately** —
no further cases run, no silently-truncated "success". Cost is estimated from a small, documented,
approximate per-model pricing table; since the project's default provider is Gemini free tier, a
real run's actual dollar cost is $0 today — the cost cap is a safety net against a future paid
provider switch, not a live pricing feed. A conservative `EVAL_RPM_LIMIT` (default 10) throttles
between real calls so a default run stays comfortably under Gemini free tier's ~10-15 RPM ceiling.

### Thresholds and verdict (`src/evals/thresholds.ts`)

Pass/fail thresholds per scorer aggregate are committed constants, each with an inline rationale
comment — a threshold change is a reviewable diff, not a hidden runtime config. The runner exits
non-zero (`process.exitCode = 1`) when any aggregate falls below its threshold.

### Report

Every run writes a machine-readable JSON report (`EVAL_REPORT_PATH`, default
`packages/agent/eval-report.json`, gitignored) with per-case scores, per-scorer aggregates,
`PROMPT_VERSION` (so a result is always attributable to the exact prompt content it ran against),
the resolved model id, and total token/cost usage — plus a human-readable summary on stdout.

### Real-run results (first budget-capped run against production code)

This suite was run for real against `getInterviewAgent()` with the local `.env`'s
`GOOGLE_GENERATIVE_AI_API_KEY` while building this task (#72), budget-capped to a handful of
cases. The run confirmed the plumbing end-to-end against the live provider — a real
`agent.generate()` call, real tool execution, real citation extraction off `toolResults`, and,
critically, **the budget cap firing for real**: a 3-case attempt was correctly aborted mid-run with
`BudgetExceededError: Eval token budget exceeded: 34055 total token(s) used, max is 20000` after
its second case — proof the "abort loudly rather than silently spend" requirement holds against
real, unpredictable token usage, not just the injected-mock unit test.

**A full-dataset aggregate report could not be produced during this task**, and this is reported
honestly rather than papered over: every subsequent attempt (raising the token/cost caps, dropping
to a single case) hit `429 RESOURCE_EXHAUSTED` — `generativelanguage.googleapis.com/generate_content_free_tier_requests`,
`quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier`, `quotaValue: 20` — the Gemini free
tier's **daily** request quota for `gemini-3.6-flash` on this project (shared with the live
production chat feature and this same task's own earlier smoke/debug calls) was already exhausted
for the day. An 8-attempt, 30-second-interval retry loop over ~4 minutes never saw it clear.

This is a real finding, not a suite bug: the "~10-15 RPM" free-tier guidance this task started from
undersold the actual binding constraint — a **20-requests-per-day** ceiling per project per model,
tight enough that this suite's own default case cap (8, each case potentially costing 1-3 provider
calls for tool-using turns) can exhaust an entire day's quota by itself, before counting production
traffic on the same key. Two consequences documented here rather than hidden:

1. **`EVAL_THRESHOLDS` in `./thresholds.ts` are placeholders, not yet calibrated against a real
   full-dataset aggregate** — the numbers there are deliberately conservative starting points with
   documented rationale, but this task could not follow through on "adjust to reflect current
   honest reality with a margin" because no full real-run aggregate exists yet to calibrate
   against. Recalibrating them against a real run (once quota allows, or against a paid/alternate
   provider — `CHAT_PROVIDER=anthropic` is already wired, see the provider table above) is
   follow-up work, not silently deferred: this paragraph is that record.
2. **A dedicated Google Cloud project/API key for eval runs**, separate from the production chat
   key, would decouple this suite's budget from production traffic — worth raising for #73 (CI
   wiring), where a scheduled or PR-triggered run competing with live traffic for the same 20/day
   ceiling would be a real operational risk, not just an inconvenience during development.

### Env knobs

| Env var                 | Purpose                                              | Default                  |
| ------------------------ | ----------------------------------------------------- | ------------------------- |
| `EVAL_MAX_CASES`         | Max dataset cases run this invocation.                | `8`                       |
| `EVAL_MAX_TOTAL_TOKENS`  | Max cumulative tokens before the run aborts.          | `60000`                   |
| `EVAL_MAX_COST_USD`      | Max estimated USD cost before the run aborts.         | `0.5`                     |
| `EVAL_RPM_LIMIT`         | Requests-per-minute throttle between real calls.      | `10`                      |
| `EVAL_REPORT_PATH`       | Where the JSON report is written.                     | `eval-report.json`        |
