import type { Citation, DomainResult } from "@hire-me-mcp/core";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { withCitationSiteUrls } from "./citation-site-urls.js";
import { createToolExecutor, defineTool, type ToolDefinition } from "./define-tool.js";
import { ToolDomainError } from "./errors.js";

const inputSchema = z.object({
  skill: z.string().min(1).describe("Skill or gap term to look up."),
});

function makeDefinition(
  handler: ToolDefinition<typeof inputSchema, unknown>["handler"],
): ToolDefinition<typeof inputSchema, unknown> {
  return {
    name: "test-tool",
    description: "A test tool used only by the adapter's own contract tests.",
    inputSchema,
    handler,
  };
}

describe("createToolExecutor", () => {
  it("returns a successful result carrying the handler's DomainResult data unmodified", async () => {
    const citation: Citation = { entityType: "skill", entityId: "skill-1", label: "TypeScript" };
    const domainResult: DomainResult<{ kind: string }> = {
      data: { kind: "claimed" },
      citations: [citation],
    };
    const executor = createToolExecutor(makeDefinition(() => domainResult));

    const result = await executor({ skill: "typescript" });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      data: domainResult.data,
      citations: withCitationSiteUrls(domainResult.citations),
    });
  });

  it("passes citations through by deep equality — no field added, dropped, or altered", async () => {
    const citations: Citation[] = [
      { entityType: "gap", entityId: "gap-1", label: "Rust in production", fragment: "statement" },
      { entityType: "skill", entityId: "skill-2", label: "Go" },
    ];
    const executor = createToolExecutor(
      makeDefinition(() => ({ data: { kind: "not-claimed" }, citations })),
    );

    const result = await executor({ skill: "rust" });

    expect(result.isError).toBeUndefined();
    const structuredContent = result.structuredContent as { citations: Citation[] };
    expect(structuredContent.citations).toStrictEqual(withCitationSiteUrls(citations));
  });

  it("keeps a domain gap/not-claimed outcome a SUCCESSFUL result, not an error or empty result", async () => {
    const notClaimed = {
      kind: "not-claimed" as const,
      gap: { id: "gap-1", statement: "Never shipped Rust." },
    };
    const executor = createToolExecutor(
      makeDefinition(() => ({ data: notClaimed, citations: [] })),
    );

    const result = await executor({ skill: "kubernetes" });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ data: notClaimed, citations: [] });
  });

  it("keeps a domain 'unknown' outcome a SUCCESSFUL result, not an error or empty result", async () => {
    const unknown = { kind: "unknown" as const, term: "cobol" };
    const executor = createToolExecutor(makeDefinition(() => ({ data: unknown, citations: [] })));

    const result = await executor({ skill: "cobol" });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ data: unknown, citations: [] });
  });

  it("produces byte-identical text and structuredContent for the same input across calls", async () => {
    const executor = createToolExecutor(
      makeDefinition(() => ({ data: { kind: "unknown", term: "cobol" }, citations: [] })),
    );

    const first = await executor({ skill: "cobol" });
    const second = await executor({ skill: "cobol" });

    expect(first.content[0].text).toBe(JSON.stringify(first.structuredContent));
    expect(first.content[0].text).toBe(second.content[0].text);
  });

  it("maps invalid input to an isError result with code invalid_input and a sanitized message", async () => {
    const executor = createToolExecutor(makeDefinition(() => ({ data: {}, citations: [] })));

    const result = await executor({ skill: "" });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "invalid_input" });
    const message = (result.structuredContent as { message: string }).message;
    expect(message).not.toMatch(/\/Users|\/home|node_modules| at /);
  });

  it("maps missing required input to an isError result with code invalid_input", async () => {
    const executor = createToolExecutor(makeDefinition(() => ({ data: {}, citations: [] })));

    const result = await executor({});

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "invalid_input" });
  });

  it("maps a thrown ToolDomainError to code domain_error with its message intact", async () => {
    const executor = createToolExecutor(
      makeDefinition(() => {
        throw new ToolDomainError('gap "rust" has no resolvable citation');
      }),
    );

    const result = await executor({ skill: "rust" });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      code: "domain_error",
      message: 'gap "rust" has no resolvable citation',
    });
  });

  it("maps an unexpected exception to code internal_error with a sanitized, generic message", async () => {
    const executor = createToolExecutor(
      makeDefinition(() => {
        throw new Error("ENOENT: /Users/marcos/secret/.env — stack trace goes here");
      }),
    );

    const result = await executor({ skill: "rust" });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "internal_error" });
    const message = (result.structuredContent as { message: string }).message;
    expect(message).not.toContain("/Users");
    expect(message).not.toContain(".env");
  });

  it("maps a rejected async handler the same way as a synchronous throw", async () => {
    const executor = createToolExecutor(
      makeDefinition(async () => {
        throw new ToolDomainError("async domain failure");
      }),
    );

    const result = await executor({ skill: "rust" });

    expect(result.structuredContent).toEqual({
      code: "domain_error",
      message: "async domain failure",
    });
  });
});

describe("validation error messages (#244)", () => {
  const richSchema = z.object({
    query: z.string().min(1).describe("Required free-text query."),
    status: z.enum(["current", "past"]).optional().describe("Optional status filter."),
  });
  const richDefinition: ToolDefinition<typeof richSchema, unknown> = {
    name: "rich-tool",
    description: "A test tool exercising validation error message quality.",
    inputSchema: richSchema,
    handler: () => ({ data: null, citations: [] }),
  };

  it("reports a missing required field as 'required', not a generic invalid-input complaint", async () => {
    const executor = createToolExecutor(richDefinition);

    const result = await executor({});

    expect(result.isError).toBe(true);
    const message = (result.structuredContent as { message: string }).message;
    expect(message).toContain("query: required");
    expect(message).not.toContain("Invalid input");
  });

  it("reports an invalid enum value by naming the allowed values and the received value", async () => {
    const executor = createToolExecutor(richDefinition);

    const result = await executor({ query: "x", status: "CURRENT" });

    expect(result.isError).toBe(true);
    const message = (result.structuredContent as { message: string }).message;
    expect(message).toContain("status:");
    expect(message).toContain('"current"');
    expect(message).toContain('"past"');
    expect(message).toContain('"CURRENT"');
  });
});

describe("defineTool", () => {
  it("registers the tool against the server with name, description, and input schema", () => {
    const registerTool = vi.fn();
    const server = { registerTool } as unknown as Parameters<typeof defineTool>[0];

    defineTool(
      server,
      makeDefinition(() => ({ data: {}, citations: [] })),
    );

    expect(registerTool).toHaveBeenCalledTimes(1);
    const [name, config] = registerTool.mock.calls[0] as [
      string,
      { description: string; inputSchema: unknown },
    ];
    expect(name).toBe("test-tool");
    expect(config.description).toBe("A test tool used only by the adapter's own contract tests.");
    expect(config.inputSchema).toBe(inputSchema);
  });

  it("wires the registered callback through the same executor pipeline (errors stay sanitized)", async () => {
    const registerTool = vi.fn();
    const server = { registerTool } as unknown as Parameters<typeof defineTool>[0];

    defineTool(
      server,
      makeDefinition(() => {
        throw new Error("/etc/shadow leaked");
      }),
    );

    const [, , callback] = registerTool.mock.calls[0] as [
      string,
      unknown,
      (args: unknown, ctx: unknown) => Promise<unknown>,
    ];
    const result = await callback({ skill: "x" }, {});

    expect((result as { isError: boolean }).isError).toBe(true);
    expect(JSON.stringify(result)).not.toContain("/etc/shadow");
  });
});
