/**
 * The shared MCP tool result envelope: every successful tool call returns a
 * `structuredContent` payload — `{ data, citations }`, taken straight from
 * the domain layer's `DomainResult` — alongside a text content block that
 * serializes that exact same object. Same input -> byte-identical output,
 * because both content forms are built from one `JSON.stringify` call over
 * one object; there is no second, independently-built rendering that could
 * drift from the first.
 *
 * Citations pass through verbatim: `structuredContent.citations` IS
 * `domainResult.citations`, unmodified, so no field can be added, dropped,
 * or renamed without changing this file (see the citation contract tests in
 * `define-tool.test.ts`).
 */

import type { DomainResult } from "@hire-me-mcp/core";

/** The `structuredContent` shape every successful tool result carries. */
export interface ToolSuccessContent<T> {
  data: T;
  citations: DomainResult<T>["citations"];
}

/**
 * A successful MCP `tools/call` result: text content plus structured content, kept in
 * lockstep. `isError` is declared (optional, never set to `true`) purely so callers can
 * read `result.isError` on the {@link ToolExecutorResult} union — defined in
 * `define-tool.ts` as `ToolSuccessResult | ToolErrorResult` — without a type guard; a
 * successful result never actually carries the field at runtime (per the MCP wire
 * format, where an absent `isError` means success).
 */
export interface ToolSuccessResult<T> {
  content: [{ type: "text"; text: string }];
  structuredContent: ToolSuccessContent<T>;
  isError?: false;
}

/**
 * Serializes a domain service's {@link DomainResult} into the shared success
 * envelope. `citations` passes through unmodified — this function never
 * rebuilds, reorders, or filters it; it only wraps `data` and `citations`
 * into one object and serializes that object once.
 */
export function buildToolSuccessResult<T>(domainResult: DomainResult<T>): ToolSuccessResult<T> {
  const structuredContent: ToolSuccessContent<T> = {
    data: domainResult.data,
    citations: domainResult.citations,
  };
  const text = JSON.stringify(structuredContent);
  return {
    content: [{ type: "text", text }],
    structuredContent,
  };
}
