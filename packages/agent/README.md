# `@hire-me-mcp/agent`

Embedded Mastra interview agent runtime with a swappable AI SDK model provider. Foundation task
of the v0.5 Interview Chat Agent epic (#5) — see #63 for the full scope.

## Embedded, not a service

This package is **plain TypeScript, imported in-process** — there is no standalone Mastra server,
worker, or extra deploy target. `apps/web` route handlers (Node runtime) call `getInterviewAgent()`
directly, the same way they import `@hire-me-mcp/core`. No new deployable process, container, or
HTTP surface is introduced by this package.

Out of scope here (covered by later tasks in epic #5): tools/domain grounding, system prompt
content (voice, gap discipline), the HTTP chat route, streaming, sessions, guardrails, and evals.
The agent instantiated by this package has a placeholder system prompt and no tools.

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

## Public API

```ts
import { getInterviewAgent } from "@hire-me-mcp/agent";

const agent = getInterviewAgent(); // model resolved from CHAT_PROVIDER env
const result = await agent.generate("What's your experience with TypeScript?");
```

`getInterviewAgent(options?)` accepts an optional `model` override (used by tests to inject a
stub model) and an optional `env` source forwarded to `createChatModel()`. This is the one stable
entry point later tasks in epic #5 (tools, system prompt, HTTP route) depend on — not package
internals.

## One-off smoke verification (not part of CI)

`scripts/smoke.ts` makes a single real call to the default Gemini model using the local `.env`
key, to prove the binding works end-to-end beyond the mocked test suite. It is not run by
`pnpm turbo test`, `pnpm test`, or CI — invoke it manually:

```bash
pnpm --filter @hire-me-mcp/agent smoke
```
