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
