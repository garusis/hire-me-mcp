import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createToolExecutor, type ToolDefinition } from "./define-tool.js";
import { ToolDomainError } from "./errors.js";

/**
 * The MCP adapter layer (#79) is the single registration path every tool
 * goes through (`CONVENTIONS.md`), so it's also the single place every
 * tool call is instrumented — no future tool can forget to record its own
 * analytics event. These tests assert exactly one `recordMcpToolEvent`
 * call per `createToolExecutor` invocation, with the outcome matching
 * what the caller actually observes.
 */
vi.mock("../analytics/record.js", () => ({ recordMcpToolEvent: vi.fn() }));

const inputSchema = z.object({ skill: z.string().min(1) });

function makeDefinition(
  handler: ToolDefinition<typeof inputSchema, unknown>["handler"],
): ToolDefinition<typeof inputSchema, unknown> {
  return {
    name: "analytics-test-tool",
    description: "A test tool used only by the adapter's own analytics instrumentation tests.",
    inputSchema,
    handler,
  };
}

describe("createToolExecutor analytics instrumentation (#79)", () => {
  it("records exactly one success tool event for a successful call", async () => {
    const { recordMcpToolEvent } = await import("../analytics/record.js");
    vi.mocked(recordMcpToolEvent).mockClear();
    const executor = createToolExecutor(
      makeDefinition(() => ({ data: { ok: true }, citations: [] })),
    );

    await executor({ skill: "typescript" });

    expect(recordMcpToolEvent).toHaveBeenCalledTimes(1);
    const [toolName, outcome, latencyMs] = vi.mocked(recordMcpToolEvent).mock.calls[0] ?? [];
    expect(toolName).toBe("analytics-test-tool");
    expect(outcome).toBe("success");
    expect(typeof latencyMs).toBe("number");
  });

  it("records exactly one invalid_input tool event when input validation fails", async () => {
    const { recordMcpToolEvent } = await import("../analytics/record.js");
    vi.mocked(recordMcpToolEvent).mockClear();
    const executor = createToolExecutor(makeDefinition(() => ({ data: {}, citations: [] })));

    await executor({});

    expect(recordMcpToolEvent).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordMcpToolEvent).mock.calls[0]?.[1]).toBe("invalid_input");
  });

  it("records exactly one domain_error tool event when the handler throws ToolDomainError", async () => {
    const { recordMcpToolEvent } = await import("../analytics/record.js");
    vi.mocked(recordMcpToolEvent).mockClear();
    const executor = createToolExecutor(
      makeDefinition(() => {
        throw new ToolDomainError("nope");
      }),
    );

    await executor({ skill: "typescript" });

    expect(recordMcpToolEvent).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordMcpToolEvent).mock.calls[0]?.[1]).toBe("domain_error");
  });

  it("records exactly one internal_error tool event when the handler throws an unexpected error", async () => {
    const { recordMcpToolEvent } = await import("../analytics/record.js");
    vi.mocked(recordMcpToolEvent).mockClear();
    const executor = createToolExecutor(
      makeDefinition(() => {
        throw new Error("bug");
      }),
    );

    await executor({ skill: "typescript" });

    expect(recordMcpToolEvent).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordMcpToolEvent).mock.calls[0]?.[1]).toBe("internal_error");
  });
});
