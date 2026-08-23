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
 * Formats Zod's structured issues into one safe, human-readable message:
 * `field.path: complaint`, joined by `; `. Zod issue paths name parameter
 * fields declared on the tool's own input schema — never filesystem paths,
 * stack frames, or environment values — so this is safe to return verbatim.
 */
function formatValidationIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "(root)"}: ${issue.message}`)
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
        message: formatValidationIssues(parsed.error),
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
  server.registerTool(
    definition.name,
    {
      title: definition.name,
      description: definition.description,
      inputSchema: definition.inputSchema,
      ...(definition.outputSchema === undefined ? {} : { outputSchema: definition.outputSchema }),
    },
    (async (args: unknown) => executor(args)) as never,
  );
  return executor;
}
