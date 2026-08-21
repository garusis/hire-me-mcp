/**
 * `POST /api/chat` (#67) handler logic — split out from `route.ts` because
 * Next.js's App Router type-checks route module exports against a closed
 * set of recognized fields (`GET`/`POST`/... and route-segment config like
 * `runtime`/`maxDuration`); any other export (e.g. this file's
 * `createChatPostHandler` test-injection seam) fails `next build`'s route
 * type validation. `route.ts` re-exports only `POST = createChatPostHandler()`
 * plus the route-segment config; every test in `handler.test.ts` imports
 * from here directly so it can inject a stubbed model.
 *
 * Runs the embedded Mastra interview agent in-process and streams the
 * response as a Vercel AI SDK v7 UI message stream, consumed by the chat
 * widget's `useChat`-style client (#70).
 *
 * ## Guardrails (#68)
 *
 * Every guardrail this issue adds runs BEFORE the agent is ever
 * constructed, in a fixed order, each returning its own distinct
 * machine-readable code (`../../../lib/chat/error-codes.ts` — the shared
 * seam #70 codes its UI against):
 *
 * 1. **Per-IP rate limit** (`ip_rate_limited`) — checked first, before the
 *    body is even parsed, since it doesn't need `sessionId`. A backstop
 *    against a client that rotates its session id to evade #2.
 * 2. **Request-shape + conversation-cap validation** (`invalid_request`,
 *    `message_count_exceeded`, `message_size_exceeded`,
 *    `conversation_size_exceeded`) — `chatRequestSchema`
 *    (`../../../lib/chat/request-schema.ts`), classified by
 *    `classifyValidationIssues`.
 * 3. **Per-session rate limit** (`session_rate_limited`) — needs the
 *    validated `sessionId`, so it runs after #2.
 * 4. **Instruction-hierarchy wrapping** — every `role: "user"` text part is
 *    passed through `wrapUserContent` (`../../../lib/chat/wrap-user-content.ts`)
 *    before reaching the agent; not a rejection, a mechanical
 *    transformation.
 * 5. **Per-turn step cap** (`step_limit_exceeded`) and **tool-input
 *    rejection logging** (`tool_input_rejected`) — enforced INSIDE the
 *    stream, since both depend on what the model does mid-turn; see the
 *    chunk loop below.
 *
 * Both rate limiters (#1, #3) reuse the exact Upstash-backed mechanism #39
 * built for the MCP route (`../../../lib/mcp/rate-limit/limiter.ts`),
 * selected via `../../../lib/chat/rate-limit.ts` — never a second
 * rate-limiting stack.
 *
 * ## Embedded, not a service
 *
 * This handler imports `@hire-me-mcp/agent`'s `getInterviewAgent()`
 * directly and calls `agent.stream()` in the same process — there is no
 * outbound HTTP call to a separate Mastra server anywhere in this file.
 *
 * ## Streaming bridge
 *
 * `@mastra/ai-sdk`'s `toAISdkStream()` is the current (Mastra 1.61)
 * documented path from an agent's `MastraModelOutput` (`agent.stream()`'s
 * return value) to an AI SDK v7 UI message stream — see
 * https://mastra.ai/reference/ai-sdk/to-ai-sdk-stream (fetched via
 * Context7, `/mastra-ai/mastra`, "Convert Mastra stream to AI SDK stream in
 * Next.js route"). It is driven from inside `ai`'s own `createUIMessageStream`
 * so that both a synchronous failure (agent construction, e.g. missing
 * provider env) and an async failure mid-stream (the model provider itself
 * erroring) go through the exact same `onError` mapping — one error path,
 * not two.
 *
 * ## Session id
 *
 * A session id is required on every request, client-generated (a UUID —
 * `crypto.randomUUID()` client-side) and carried in the JSON body as
 * `sessionId`, validated by `../../../lib/chat/request-schema.ts`. A
 * server-issued cookie was the other option on the table; a request-body
 * UUID was chosen instead because: (1) the future chat widget (#70) and any
 * embedder of this endpoint may be cross-origin, where third-party cookies
 * are unreliable; (2) the stubbed-model integration test suite this route
 * ships with needs zero cookie-jar machinery to exercise every path; (3)
 * the guardrails task (#68) that keys rate limits off this id can read it
 * from the already-validated body with no extra plumbing. A request without
 * a `sessionId` is rejected with 400, not silently assigned one — the
 * decision this issue asks to be documented.
 *
 * ## Error mapping
 *
 * See `../../../lib/chat/stream-errors.ts`: every thrown error, once the
 * stream has been handed to the client, becomes a `type: "error"` UI
 * message chunk carrying a small closed set of codes and a fixed safe
 * message — never the original error's message or stack, never a
 * truncated connection.
 */

import type { ChatModel } from "@hire-me-mcp/agent";
import { getInterviewAgent } from "@hire-me-mcp/agent";
import { toAISdkStream } from "@mastra/ai-sdk";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { CHAT_AGENT_LIMITS_DEFAULTS, readChatAgentStepLimit } from "../../../lib/chat/agent-limits";
import { CHAT_ERROR_MESSAGES } from "../../../lib/chat/error-codes";
import { logChatEvent } from "../../../lib/chat/logger";
import {
  type ChatRateLimiters,
  readChatRateLimitConfig,
  selectChatRateLimiters,
} from "../../../lib/chat/rate-limit";
import { buildChatRateLimitExceededResponse } from "../../../lib/chat/rate-limit-response";
import { type ChatRequestBody, chatRequestSchema } from "../../../lib/chat/request-schema";
import { classifyStreamError, toStreamErrorEventText } from "../../../lib/chat/stream-errors";
import {
  buildValidationErrorResponse,
  classifyValidationIssues,
} from "../../../lib/chat/validation-response";
import { wrapUserContent } from "../../../lib/chat/wrap-user-content";
import { identifyCaller } from "../../../lib/mcp/rate-limit/identify-caller";

function formatValidationIssues(issues: Array<{ path: PropertyKey[]; message: string }>): string {
  return issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "(root)"}: ${issue.message}`)
    .join("; ");
}

function countToolSteps(chunkType: string, seen: Set<string>, toolCallId: unknown): void {
  if (chunkType === "tool-input-available" && typeof toolCallId === "string") {
    seen.add(toolCallId);
  }
}

/** The minimal shape this module reads off an emitted `toAISdkStream` chunk. */
interface StreamChunkLike {
  type?: string;
  toolCallId?: unknown;
  output?: { error?: unknown; validationErrors?: unknown };
}

/**
 * Guardrails #5a/#5b, factored out of `execute`'s per-chunk loop below to
 * keep that closure's cognitive complexity within Biome's limit: (a) logs a
 * `tool_input_rejected` event (never the raw tool input) when a tool call's
 * arguments failed their strict schema (#64) before the domain service ran
 * — see `handler.ts`'s module docs for how that's detected on this exact
 * Mastra/`@mastra/ai-sdk` version; (b) tracks distinct tool-call steps taken
 * this turn and reports whether the configured per-turn cap has now been
 * exceeded, in which case the caller must stop reading and halt the turn.
 */
function trackChunkAndCheckStepLimit(params: {
  chunk: StreamChunkLike;
  toolCallIdsSeen: Set<string>;
  agentMaxSteps: number;
  sessionId: string;
  latencyMs: number;
}): boolean {
  const { chunk, toolCallIdsSeen, agentMaxSteps, sessionId, latencyMs } = params;
  const chunkType = chunk.type;
  if (typeof chunkType !== "string") {
    return false;
  }

  if (chunkType === "tool-output-available" && chunk.output?.validationErrors) {
    logChatEvent({
      event: "chat_request_rejected",
      sessionId,
      latencyMs,
      errorCode: "tool_input_rejected",
    });
  }

  countToolSteps(chunkType, toolCallIdsSeen, chunk.toolCallId);

  if (toolCallIdsSeen.size > agentMaxSteps) {
    logChatEvent({
      event: "chat_request_rejected",
      sessionId,
      latencyMs,
      errorCode: "step_limit_exceeded",
    });
    return true;
  }
  return false;
}

/**
 * Every `role: "user"` message's text parts are wrapped
 * (`../../../lib/chat/wrap-user-content.ts`) before the messages reach the
 * agent — the mechanical half of instruction-hierarchy hardening (#68).
 * `role: "assistant"` history and the system prompt itself (set only via
 * `Agent`'s own `instructions`) are never touched.
 */
function wrapUserMessages(messages: ChatRequestBody["messages"]): ChatRequestBody["messages"] {
  return messages.map((message) => {
    if (message.role !== "user") return message;
    return {
      ...message,
      parts: message.parts.map((part) => ({ ...part, text: wrapUserContent(part.text) })),
    };
  });
}

/** Options for {@link createChatPostHandler} — `model` is the test injection seam (mirrors #63's `getInterviewAgent({ model })`); `rateLimiters` and `agentMaxSteps` are #68's. */
export interface ChatRouteOptions {
  model?: ChatModel;
  /** Injected rate limiters — defaults to `selectChatRateLimiters(readChatRateLimitConfig())`. Test seam; also how the "shared store" proof injects a fake backed by an explicit shared `Map` (see `handler.test.ts`). */
  rateLimiters?: ChatRateLimiters;
  /** Per-turn step/tool-call cap — defaults to `readChatAgentStepLimit()`. Test seam for the looping-stub-halt test. */
  agentMaxSteps?: number;
}

/**
 * Builds the `POST` handler. A bare function rather than a class so tests
 * can inject a stubbed `model` (via `getInterviewAgent`'s own seam), a fake
 * `rateLimiters` pair, or a tighter `agentMaxSteps` without touching
 * `process.env` or making a real model call — mirrors the pattern
 * `packages/agent`'s own tests already use.
 *
 * `rateLimiters` and `agentMaxSteps` are resolved ONCE per handler
 * instance (module scope in `route.ts`, since `POST = createChatPostHandler()`
 * runs once at import time) — the real, Upstash-backed limiters this
 * resolves to (`selectChatRateLimiters`) are themselves stateless local
 * objects whose actual counters live in Redis, so this one-time resolution
 * never reintroduces the per-instance-memory problem #68's AC guards
 * against.
 */
export function createChatPostHandler(options: ChatRouteOptions = {}) {
  const rateLimiters = options.rateLimiters ?? selectChatRateLimiters(readChatRateLimitConfig());
  const agentMaxSteps =
    options.agentMaxSteps ?? readChatAgentStepLimit() ?? CHAT_AGENT_LIMITS_DEFAULTS.maxSteps;

  return async function POST(request: Request): Promise<Response> {
    const startedAt = Date.now();

    // Guardrail #1: per-IP backstop, checked before the body is even
    // parsed — it needs no validated field, so there's no reason to do the
    // (comparatively expensive) JSON parse + schema validation first for a
    // caller that's going to be rejected regardless.
    let ipOutcome: Awaited<ReturnType<ChatRateLimiters["ip"]["limit"]>> | undefined;
    try {
      ipOutcome = await rateLimiters.ip.limit(identifyCaller(request.headers));
    } catch (error) {
      // Fail open on a limiter error, same policy as the MCP route's
      // with-rate-limit.ts — a limiter outage must not take the endpoint down.
      console.warn("[chat] IP rate limiter threw — failing open for this request", error);
    }
    if (ipOutcome && !ipOutcome.success) {
      return buildChatRateLimitExceededResponse("ip_rate_limited", ipOutcome);
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return buildValidationErrorResponse("Request body must be valid JSON.");
    }

    // Guardrail #2: request shape + the message-count/size/conversation-size
    // caps (all enforced inside chatRequestSchema — see request-schema.ts).
    const parsed = chatRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      const code = classifyValidationIssues(parsed.error.issues);
      return buildValidationErrorResponse(formatValidationIssues(parsed.error.issues), code);
    }

    const { sessionId, messages }: ChatRequestBody = parsed.data;

    // Guardrail #3: per-session limit, now that sessionId is validated.
    let sessionOutcome: Awaited<ReturnType<ChatRateLimiters["session"]["limit"]>> | undefined;
    try {
      sessionOutcome = await rateLimiters.session.limit(sessionId);
    } catch (error) {
      console.warn("[chat] session rate limiter threw — failing open for this request", error);
    }
    if (sessionOutcome && !sessionOutcome.success) {
      return buildChatRateLimitExceededResponse("session_rate_limited", sessionOutcome);
    }

    // Guardrail #4: wrap every user text part so embedded instructions are
    // mechanically delimited as data, not commands — see wrap-user-content.ts.
    const agentInputMessages = wrapUserMessages(messages);
    const toolCallIdsSeen = new Set<string>();

    // The single error-mapping choke point. Two different layers can
    // observe a failure and both funnel through this: (1) Mastra's own
    // agent loop doesn't always *throw* a provider/model error out of the
    // `for await` below — it can instead emit an `error` chunk directly
    // into the stream (see `@mastra/ai-sdk`'s `toAiSdkStream` `onError`
    // option, which is exactly the hook for that case, and which — left
    // unset — would otherwise serialize the raw error, including its
    // stack, straight into the chunk); (2) a genuine synchronous throw
    // (e.g. `getInterviewAgent()` failing on missing provider config)
    // surfaces via `createUIMessageStream`'s own top-level `onError`
    // below. Both call this so the classification, logging, and the text
    // written into the client-visible `error` chunk are identical either
    // way.
    function handleStreamError(error: unknown): string {
      const classified = classifyStreamError(error);
      logChatEvent({
        event: "chat_request_failed",
        sessionId,
        latencyMs: Date.now() - startedAt,
        errorCode: classified.code,
      });
      return toStreamErrorEventText(classified);
    }

    const uiStream = createUIMessageStream({
      // The client's OWN messages (unwrapped) — this is what
      // `createUIMessageStream` reconciles the emitted deltas against for
      // the response the client sees, so it must mirror what the client
      // sent, not the internal wrapped form only the agent ever sees.
      originalMessages: messages as unknown as Parameters<
        typeof createUIMessageStream
      >[0]["originalMessages"],
      execute: async ({ writer }) => {
        const agent = getInterviewAgent({ model: options.model });
        const streamResult = await agent.stream(
          agentInputMessages as unknown as Parameters<typeof agent.stream>[0],
          // `maxSteps` is Mastra's own step-budget stop condition — set one
          // step ABOVE the configured cap deliberately, so it's a true
          // last-resort ceiling (insurance against a bug in the manual halt
          // below) rather than the thing that actually stops the loop:
          // Mastra stops silently at its own `maxSteps` with no error chunk
          // on the stream, which isn't a user-presentable outcome. The
          // manual halt below — driven by `agentMaxSteps` exactly — is what
          // produces the `step_limit_exceeded` error the client sees, and
          // fires one step before Mastra's own ceiling would ever be hit.
          { abortSignal: request.signal, maxSteps: agentMaxSteps + 1 },
        );

        const reader = toAISdkStream(streamResult, {
          from: "agent",
          version: "v7",
          onError: handleStreamError,
        }).getReader();

        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          // Guardrails #5a (tool-input rejection logging) and #5b (per-turn
          // step cap) — see trackChunkAndCheckStepLimit's docs.
          const stepLimitExceeded = trackChunkAndCheckStepLimit({
            chunk: value as StreamChunkLike,
            toolCallIdsSeen,
            agentMaxSteps,
            sessionId,
            latencyMs: Date.now() - startedAt,
          });
          if (stepLimitExceeded) {
            // Flat `{ code, message }`, matching the shape every other
            // stream `error` chunk carries (`toStreamErrorEventText`,
            // `stream-errors.ts`) — not the nested `{ error: { code,
            // message } }` HTTP body shape `buildChatErrorPayload` builds
            // for the pre-stream 4xx responses above.
            writer.write({
              type: "error",
              errorText: JSON.stringify({
                code: "step_limit_exceeded",
                message: CHAT_ERROR_MESSAGES.step_limit_exceeded,
              }),
            } as unknown as Parameters<typeof writer.write>[0]);
            await reader.cancel().catch(() => undefined);
            return;
          }
          // Same nominal-vs-structural boundary as `originalMessages`
          // above: Mastra's emitted chunk and the AI SDK's own
          // `InferUIMessageChunk` are structurally the same wire shape.
          writer.write(value as unknown as Parameters<typeof writer.write>[0]);
        }

        const usage = await streamResult.usage.catch(() => undefined);
        logChatEvent({
          event: "chat_request_completed",
          sessionId,
          latencyMs: Date.now() - startedAt,
          stepCount: toolCallIdsSeen.size,
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
        });
      },
      onError: handleStreamError,
    });

    return createUIMessageStreamResponse({ stream: uiStream });
  };
}
