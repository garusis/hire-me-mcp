import type { Citation, DomainResult } from "@hire-me-mcp/core";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { withCitationSiteUrls } from "./citation-site-urls.js";
import {
  createToolExecutor,
  defineTool,
  numberRangeMessage,
  stringLengthMessage,
  type ToolDefinition,
} from "./define-tool.js";
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

/**
 * Issue 276 — #244 gave enum and format constraints self-correcting error
 * text but missed numeric ranges and string/array lengths, which kept
 * emitting a bare "Invalid input" (identical for `limit: 0`, `limit: -1` and
 * `limit: 101`, so not even hinting which end of the range was violated).
 */
describe("range and length validation error messages (#276)", () => {
  function executorFor(schema: z.ZodTypeAny) {
    return createToolExecutor({
      name: "bounded-tool",
      description: "A test tool exercising range/length validation message quality.",
      inputSchema: schema,
      handler: () => ({ data: null, citations: [] }),
    });
  }

  async function messageFor(schema: z.ZodTypeAny, args: unknown): Promise<string> {
    const result = await executorFor(schema)(args);
    expect(result.isError).toBe(true);
    return (result.structuredContent as { message: string }).message;
  }

  it("names the field, the constraint and the whole range for a schema-declared numeric range", async () => {
    const schema = z.object({
      limit: z
        .number({ error: () => numberRangeMessage(1, 50, { integer: true }) })
        .int({ error: () => numberRangeMessage(1, 50, { integer: true }) })
        .min(1, { error: () => numberRangeMessage(1, 50, { integer: true }) })
        .max(50, { error: () => numberRangeMessage(1, 50, { integer: true }) })
        .optional()
        .describe("Bounded limit."),
    });

    for (const limit of [0, -1, 51, 2.5, "three"]) {
      const message = await messageFor(schema, { limit });
      expect(message).toBe("limit: must be an integer between 1 and 50");
      expect(message).not.toContain("Invalid input");
    }
  });

  it("names the field and the whole length range for a schema-declared string length", async () => {
    const schema = z.object({
      query: z
        .string()
        .trim()
        .min(1, { error: () => stringLengthMessage(1, 10, { trimmed: true }) })
        .max(10, { error: () => stringLengthMessage(1, 10, { trimmed: true }) })
        .describe("Bounded query."),
    });

    expect(await messageFor(schema, { query: "   " })).toBe(
      "query: must be 1-10 characters after trimming",
    );
    expect(await messageFor(schema, { query: "a".repeat(11) })).toBe(
      "query: must be 1-10 characters after trimming",
    );
  });

  // The synthesized fallback: a schema author who forgets an explicit
  // message must still never ship a bare "Invalid input".
  it.each([
    [z.object({ n: z.number().min(5).describe("n") }), { n: 1 }, "n: must be >= 5"],
    [z.object({ n: z.number().max(5).describe("n") }), { n: 9 }, "n: must be <= 5"],
    [z.object({ n: z.number().positive().describe("n") }), { n: 0 }, "n: must be > 0"],
    [z.object({ s: z.string().min(1).describe("s") }), { s: "" }, "s: must be a non-empty string"],
    [
      z.object({ s: z.string().min(3).describe("s") }),
      { s: "ab" },
      "s: must have 3 characters or more",
    ],
    [
      z.object({ s: z.string().max(2).describe("s") }),
      { s: "abc" },
      "s: must have 2 characters or fewer",
    ],
    [
      z.object({ a: z.array(z.string()).max(2).describe("a") }),
      { a: ["x", "y", "z"] },
      "a: must have 2 items or fewer",
    ],
  ])(
    "synthesizes a bound-naming message when the schema declares none (case %#)",
    async (schema, args, expected) => {
      const message = await messageFor(schema, args);
      expect(message).toBe(expected);
      expect(message).not.toContain("Invalid input");
    },
  );

  it("never overrides a message the schema author wrote themselves", async () => {
    const schema = z.object({
      from: z
        .string()
        .regex(/^\d{4}-\d{2}$/, "must be a YYYY-MM date")
        .describe("Date bound."),
    });

    expect(await messageFor(schema, { from: "nope" })).toBe("from: must be a YYYY-MM date");
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

  it("registers read-only MCP annotations on every tool — this server can never mutate anything (#241)", () => {
    const registerTool = vi.fn();
    const server = { registerTool } as unknown as Parameters<typeof defineTool>[0];

    defineTool(server, { ...makeDefinition(() => ({ data: {}, citations: [] })), title: "Test" });

    const [, config] = registerTool.mock.calls[0] as [
      string,
      { title?: string; annotations?: Record<string, unknown> },
    ];
    expect(config.title).toBe("Test");
    expect(config.annotations).toEqual({
      title: "Test",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
  });

  it("strips structuredContent from ERROR results at the wire boundary — a declared outputSchema describes success only, and strict clients validate structuredContent against it whenever present (#242)", async () => {
    const registerTool = vi.fn();
    const server = { registerTool } as unknown as Parameters<typeof defineTool>[0];

    defineTool(server, {
      ...makeDefinition(() => {
        throw new ToolDomainError("intentional failure");
      }),
      outputSchema: z.object({ data: z.string(), citations: z.array(z.unknown()) }),
    });
    const [, , callback] = registerTool.mock.calls[0] as [
      string,
      unknown,
      (args: unknown, ctx: unknown) => Promise<Record<string, unknown>>,
    ];

    const wireResult = await callback({ skill: "x" }, {});

    expect(wireResult.isError).toBe(true);
    expect(wireResult).not.toHaveProperty("structuredContent");
    expect((wireResult.content as Array<{ text: string }>)[0]?.text).toContain(
      "intentional failure",
    );
  });

  it("keeps structuredContent on SUCCESS results at the wire boundary", async () => {
    const registerTool = vi.fn();
    const server = { registerTool } as unknown as Parameters<typeof defineTool>[0];

    defineTool(
      server,
      makeDefinition(() => ({ data: { ok: true }, citations: [] })),
    );
    const [, , callback] = registerTool.mock.calls[0] as [
      string,
      unknown,
      (args: unknown, ctx: unknown) => Promise<Record<string, unknown>>,
    ];

    const wireResult = await callback({ skill: "x" }, {});

    expect(wireResult).toHaveProperty("structuredContent");
  });

  it("falls back to the wire name as title when a definition declares none", () => {
    const registerTool = vi.fn();
    const server = { registerTool } as unknown as Parameters<typeof defineTool>[0];

    defineTool(
      server,
      makeDefinition(() => ({ data: {}, citations: [] })),
    );

    const [, config] = registerTool.mock.calls[0] as [
      string,
      { title?: string; annotations?: { title?: string } },
    ];
    expect(config.title).toBe("test-tool");
    expect(config.annotations?.title).toBe("test-tool");
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
