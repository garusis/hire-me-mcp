import { describe, expect, it } from "vitest";
import { normalizeTerm, tokenize } from "./normalize.js";

describe("tokenize", () => {
  it("lowercases and trims", () => {
    expect(tokenize("  TypeScript  ")).toEqual(["typescript"]);
  });

  it("splits on whitespace into multiple tokens", () => {
    expect(tokenize("full stack engineer")).toEqual(["full", "stack", "engineer"]);
  });

  it("strips surrounding punctuation from each token", () => {
    expect(tokenize("(React), Node.js!")).toEqual(["react", "nodejs"]);
  });

  it("strips diacritics, including Spanish accents", () => {
    expect(tokenize("Diseño café")).toEqual(["diseno", "cafe"]);
  });

  it("collapses runs of internal whitespace", () => {
    expect(tokenize("full   stack    engineer")).toEqual(["full", "stack", "engineer"]);
  });

  it("preserves internal hyphens so kebab-case tags stay a single token", () => {
    expect(tokenize("openai-api ai-agents")).toEqual(["openai-api", "ai-agents"]);
  });

  it("drops common English stopwords", () => {
    expect(tokenize("the search for a project")).toEqual(["search", "project"]);
  });

  it("returns an empty array for an empty or whitespace-only string", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("   ")).toEqual([]);
  });

  it("returns an empty array when input is only punctuation", () => {
    expect(tokenize("!!! ---")).toEqual([]);
  });

  it("case, punctuation, diacritics and whitespace variants of the same phrase tokenize identically", () => {
    const variants = ["Postgres", "  postgres  ", "POSTGRES!", "Pòstgres"];
    for (const variant of variants) {
      expect(tokenize(variant)).toEqual(["postgres"]);
    }
  });
});

describe("normalizeTerm", () => {
  it("normalizes a single word the same way tokenize does", () => {
    expect(normalizeTerm("TypeScript")).toBe("typescript");
  });

  it("normalizes a multi-word phrase into a space-joined token sequence", () => {
    expect(normalizeTerm("Amazon Web Services")).toBe("amazon web services");
  });

  it("strips diacritics and punctuation", () => {
    expect(normalizeTerm("  Diseño, Café!  ")).toBe("diseno cafe");
  });

  it("normalizes equivalent phrasings to the same string", () => {
    expect(normalizeTerm("Node.js")).toBe(normalizeTerm("  NODE.JS  "));
  });
});
