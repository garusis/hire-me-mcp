import type { Citation, DomainResult } from "@hire-me-mcp/core";
import { describe, expect, it } from "vitest";
import { buildToolSuccessResult } from "./envelope.js";

describe("buildToolSuccessResult", () => {
  const citation: Citation = { entityType: "skill", entityId: "skill-1", label: "TypeScript" };
  const domainResult: DomainResult<{ term: string }> = {
    data: { term: "typescript" },
    citations: [citation],
  };

  it("wraps data and citations into structuredContent, adding each citation's canonical site url (#247)", () => {
    const result = buildToolSuccessResult(domainResult);
    expect(result.structuredContent).toEqual({
      data: domainResult.data,
      citations: [{ ...citation, url: "http://localhost:3000/skills#skill-1" }],
    });
  });

  it("passes every authored citation field through by deep equality — url is the only derived addition (#247)", () => {
    const result = buildToolSuccessResult(domainResult);
    expect(result.structuredContent.citations).toStrictEqual([
      { ...citation, url: "http://localhost:3000/skills#skill-1" },
    ]);
    expect(domainResult.citations[0]).not.toHaveProperty("url");
  });

  it("keeps a citation's own external url when the domain layer already provided one", () => {
    const external: DomainResult<{ term: string }> = {
      data: { term: "cowork" },
      citations: [
        {
          entityType: "project",
          entityId: "cowork",
          label: "cowork",
          url: "https://github.com/garusis/cowork",
        } as Citation,
      ],
    };
    const result = buildToolSuccessResult(external);
    expect(result.structuredContent.citations).toEqual([
      {
        entityType: "project",
        entityId: "cowork",
        label: "cowork",
        url: "https://github.com/garusis/cowork",
      },
    ]);
  });

  it("produces a text content block equal to structuredContent, deterministically serialized", () => {
    const first = buildToolSuccessResult(domainResult);
    const second = buildToolSuccessResult(domainResult);
    expect(first.content[0].text).toBe(JSON.stringify(first.structuredContent));
    expect(first.content[0].text).toBe(second.content[0].text);
  });

  it("has exactly one content block, of type text", () => {
    const result = buildToolSuccessResult(domainResult);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
  });

  it("carries an empty citations array through unchanged when the domain result has none", () => {
    const empty: DomainResult<{ term: string }> = { data: { term: "cobol" }, citations: [] };
    const result = buildToolSuccessResult(empty);
    expect(result.structuredContent.citations).toStrictEqual([]);
  });
});
