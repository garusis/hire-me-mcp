/**
 * `defineTool` — the single registration path for every MCP tool in this
 * server (#19). Wraps a Zod input schema, an optional Zod output schema,
 * and a thin handler over `packages/core` into the shared result envelope
 * (`envelope.ts`) and error mapping (`errors.ts`), then registers the tool
 * against a real `McpServer` instance — the one `mcp-handler`'s
 * `createMcpHandler` (`apps/web/app/api/mcp/route.ts`, #11) hands to its
 * initializer callback per request.
 *
 * `createToolExecutor` is exported separately so tests can drive a tool's
 * full input-validate / handle / error-map pipeline directly, without
 * spinning up an `McpServer`, a transport, or Next.js. See
 * `CONVENTIONS.md` for the house style every `ToolDefinition` must follow.
 */

import type { DomainResult } from "@hire-me-mcp/core";
import type { McpServer } from "@modelcontextprotocol/server";
import type { z } from "zod";
import { recordMcpToolEvent } from "../analytics/record";
import { buildToolSuccessResult, type ToolSuccessResult } from "./envelope";
import { buildToolErrorResult, mapThrownError, type ToolErrorResult } from "./errors";

/** Declarative shape every MCP tool in this server is defined with. */
export interface ToolDefinition<InputSchema extends z.ZodTypeAny, Output> {
  /** The tool's wire name — see `CONVENTIONS.md` for naming rules. */
  name: string;
  /** Human-readable display name (#241) — what MCP clients show instead of the kebab-case wire name. */
  title?: string;
  /** Model-facing description — see `CONVENTIONS.md` for the required template. */
  description: string;
  /** Validates and types `tools/call` arguments; every field needs its own `.describe()`. */
  inputSchema: InputSchema;
  /** Optional: validates `structuredContent` on success. Never applied to error results. */
  outputSchema?: z.ZodTypeAny;
  /** Thin adapter over a `packages/core` domain service; must return its `DomainResult` as-is. */
  handler: (input: z.infer<InputSchema>) => Promise<DomainResult<Output>> | DomainResult<Output>;
}

/** What `createToolExecutor` resolves to — a success or a sanitized error result. Never throws. */
export type ToolExecutorResult<Output> = ToolSuccessResult<Output> | ToolErrorResult;

/**
 * Message for a field whose value failed an enum constraint — names every
 * allowed value and the received value, so a caller can self-correct
 * without re-reading the schema (#244). Usable both as a Zod `error`
 * callback (so the message survives the MCP SDK's own pre-handler
 * validation, which relays `issue.message` verbatim and, in a production
 * bundle, can otherwise degrade to a bare "Invalid input") and by
 * {@link formatValidationIssues} below.
 */
export function enumValueMessage(values: readonly string[], received: unknown): string {
  const expected = values.map((value) => JSON.stringify(value)).join(", ");
  return received === undefined
    ? `expected one of ${expected}`
    : `expected one of ${expected}; received ${JSON.stringify(received)}`;
}

/** Walks `input` along a Zod issue path to recover the offending raw value (best-effort). */
function valueAtPath(input: unknown, path: ReadonlyArray<PropertyKey>): unknown {
  let current: unknown = input;
  for (const key of path) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<PropertyKey, unknown>)[key];
  }
  return current;
}

/**
 * One issue's complaint, synthesized from the issue's *structured* fields
 * rather than trusting `issue.message` for the common cases (#244):
 *
 * - a missing required field says `required` — distinct from a
 *   present-but-wrong value, which zod's default message conflates with it;
 * - a failed enum/literal constraint names the allowed values and the
 *   received value via {@link enumValueMessage};
 * - everything else keeps zod's own message (custom `.regex(...)` messages
 *   like `must be a YYYY-MM date` pass through untouched).
 */
function describeValidationIssue(issue: z.core.$ZodIssue, rawArgs: unknown): string {
  const received = valueAtPath(rawArgs, issue.path);
  if (issue.code === "invalid_type" && received === undefined) {
    return "required";
  }
  if (issue.code === "invalid_value" && issue.values.length > 0) {
    return enumValueMessage(
      issue.values.filter((value): value is string => typeof value === "string"),
      received,
    );
  }
  return issue.message;
}

/**
 * Formats Zod's structured issues into one safe, human-readable message:
 * `field.path: complaint`, joined by `; `. Zod issue paths name parameter
 * fields declared on the tool's own input schema — never filesystem paths,
 * stack frames, or environment values — so this is safe to return verbatim.
 */
function formatValidationIssues(error: z.ZodError, rawArgs: unknown): string {
  return error.issues
    .map(
      (issue) =>
        `${issue.path.length > 0 ? issue.path.join(".") : "(root)"}: ${describeValidationIssue(issue, rawArgs)}`,
    )
    .join("; ");
}

/**
 * Builds the tool's full request pipeline as a plain async function:
 * validate `rawArgs` against `inputSchema` (this module's own validation,
 * independent of whatever the MCP server does before invoking the
 * registered callback) -> call `handler` -> envelope the resulting
 * `DomainResult` on success, or map any thrown error to a sanitized
 * `{ code, message }` result. Never throws — every outcome, including a
 * bug in `handler`, resolves to a `ToolExecutorResult`.
 *
 * Also the single instrumentation point for the anonymized usage-analytics
 * pipeline (#79): every resolution path — success, invalid input, a
 * thrown {@link ToolDomainError}, or an unexpected error — records exactly
 * one `recordMcpToolEvent` call with the tool's name, the matching
 * outcome, and the elapsed latency, before returning. Because this is the
 * only function every `ToolDefinition` is executed through, no future
 * tool can add itself without being instrumented.
 */
export function createToolExecutor<InputSchema extends z.ZodTypeAny, Output>(
  definition: ToolDefinition<InputSchema, Output>,
): (rawArgs: unknown) => Promise<ToolExecutorResult<Output>> {
  return async (rawArgs: unknown) => {
    const startedAt = Date.now();
    const parsed = definition.inputSchema.safeParse(rawArgs ?? {});
    if (!parsed.success) {
      recordMcpToolEvent(definition.name, "invalid_input", Date.now() - startedAt);
      return buildToolErrorResult({
        code: "invalid_input",
        message: formatValidationIssues(parsed.error, rawArgs),
      });
    }
    try {
      const domainResult = await definition.handler(parsed.data);
      recordMcpToolEvent(definition.name, "success", Date.now() - startedAt);
      return buildToolSuccessResult(domainResult);
    } catch (error) {
      const payload = mapThrownError(error);
      recordMcpToolEvent(definition.name, payload.code, Date.now() - startedAt);
      return buildToolErrorResult(payload);
    }
  };
}

/**
 * Registers `definition` against `server` through the shared executor — the
 * only call site in this codebase allowed to call `server.registerTool`
 * directly (see `CONVENTIONS.md`). Returns the executor so callers (tests,
 * mainly) can invoke the exact same pipeline without a live server.
 */
export function defineTool<InputSchema extends z.ZodTypeAny, Output>(
  server: McpServer,
  definition: ToolDefinition<InputSchema, Output>,
): (rawArgs: unknown) => Promise<ToolExecutorResult<Output>> {
  const executor = createToolExecutor(definition);
  const title = definition.title ?? definition.name;
  server.registerTool(
    definition.name,
    {
      title,
      description: definition.description,
      inputSchema: definition.inputSchema,
      ...(definition.outputSchema === undefined ? {} : { outputSchema: definition.outputSchema }),
      // Every tool on this server reads a static career dataset — the server
      // is public, anonymous, and read-only by design (#241). Declaring the
      // hints here, on the single registration path, means no future tool
      // can be added without them; if a mutating tool ever lands (it
      // shouldn't), this is the seam that must become per-definition.
      annotations: {
        title,
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (async (args: unknown) => {
      const result = await executor(args);
      // A declared outputSchema describes SUCCESS structuredContent only,
      // but strict clients (including the MCP TS SDK) validate
      // structuredContent against it whenever the field is present — so an
      // error result must not carry one on the wire. The executor keeps
      // returning it for in-process consumers (tests, the chat surface),
      // which want the sanitized { code, message } as data.
      if (result.isError) {
        const { structuredContent: _structuredContent, ...wireResult } = result;
        return wireResult;
      }
      return result;
    }) as never,
  );
  return executor;
}
