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
import { logChatEvent } from "../../../lib/chat/logger";
import { type ChatRequestBody, chatRequestSchema } from "../../../lib/chat/request-schema";
import { classifyStreamError, toStreamErrorEventText } from "../../../lib/chat/stream-errors";
import { buildValidationErrorResponse } from "../../../lib/chat/validation-response";

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

/** Options for {@link createChatPostHandler} — `model` is the test injection seam (mirrors #63's `getInterviewAgent({ model })`). */
export interface ChatRouteOptions {
  model?: ChatModel;
}

/**
 * Builds the `POST` handler. A bare function rather than a class so tests
 * can inject a stubbed `model` (via `getInterviewAgent`'s own seam) without
 * touching `process.env` or making a real model call — mirrors the pattern
 * `packages/agent`'s own tests already use.
 */
export function createChatPostHandler(options: ChatRouteOptions = {}) {
  return async function POST(request: Request): Promise<Response> {
    const startedAt = Date.now();

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return buildValidationErrorResponse("Request body must be valid JSON.");
    }

    const parsed = chatRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return buildValidationErrorResponse(formatValidationIssues(parsed.error.issues));
    }

    const { sessionId, messages }: ChatRequestBody = parsed.data;
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
      // `messages` is already validated by `chatRequestSchema` against the
      // AI SDK v7 `UIMessage` shape (`request-schema.ts`), but Mastra's
      // `MessageListInput` union is typed against its own vendored AI SDK
      // type snapshot rather than the `ai` package's — two structurally
      // identical, nominally distinct types. The cast is the boundary
      // between them; the schema is what actually guarantees the shape.
      originalMessages: messages as unknown as Parameters<
        typeof createUIMessageStream
      >[0]["originalMessages"],
      execute: async ({ writer }) => {
        const agent = getInterviewAgent({ model: options.model });
        const streamResult = await agent.stream(
          messages as unknown as Parameters<typeof agent.stream>[0],
          { abortSignal: request.signal },
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
          const chunkType = (value as { type?: string }).type;
          if (typeof chunkType === "string") {
            countToolSteps(
              chunkType,
              toolCallIdsSeen,
              (value as { toolCallId?: unknown }).toolCallId,
            );
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
