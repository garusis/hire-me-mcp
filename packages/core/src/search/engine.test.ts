import { describe, expect, it } from "vitest";
import { type SearchDocument, search } from "./engine.js";

function doc(
  id: string,
  fields: { name: string; weight: number; tokens: string[] }[],
): SearchDocument {
  return { id, fields };
}

describe("search", () => {
  it("scores a document by summing the weight of every field a query token matches", () => {
    const documents = [
      doc("only-tag", [
        { name: "tag", weight: 100, tokens: ["typescript"] },
        { name: "name", weight: 50, tokens: ["cowork"] },
      ]),
      doc("tag-and-name", [
        { name: "tag", weight: 100, tokens: ["typescript"] },
        { name: "name", weight: 50, tokens: ["typescript", "platform"] },
      ]),
    ];

    const results = search(documents, ["typescript"]);

    expect(results.map((r) => r.id)).toEqual(["tag-and-name", "only-tag"]);
    expect(results[0]?.score).toBe(150);
    expect(results[1]?.score).toBe(100);
  });

  it("ranks an exact field match higher than a lower-weighted field, per documented field weights", () => {
    const documents = [
      doc("matches-body-only", [{ name: "body", weight: 5, tokens: ["typescript", "pipeline"] }]),
      doc("matches-tag-only", [{ name: "tag", weight: 100, tokens: ["typescript"] }]),
      doc("matches-summary-only", [{ name: "summary", weight: 20, tokens: ["typescript"] }]),
      doc("matches-name-only", [{ name: "name", weight: 50, tokens: ["typescript"] }]),
    ];

    const results = search(documents, ["typescript"]);

    expect(results.map((r) => r.id)).toEqual([
      "matches-tag-only",
      "matches-name-only",
      "matches-summary-only",
      "matches-body-only",
    ]);
  });

  it("excludes documents with no matching field from the results", () => {
    const documents = [
      doc("matches", [{ name: "tag", weight: 100, tokens: ["typescript"] }]),
      doc("no-match", [{ name: "tag", weight: 100, tokens: ["python"] }]),
    ];

    const results = search(documents, ["typescript"]);

    expect(results.map((r) => r.id)).toEqual(["matches"]);
  });

  it("breaks equal scores by ascending id, deterministically", () => {
    const documents = [
      doc("zeta", [{ name: "tag", weight: 100, tokens: ["typescript"] }]),
      doc("alpha", [{ name: "tag", weight: 100, tokens: ["typescript"] }]),
      doc("mid", [{ name: "tag", weight: 100, tokens: ["typescript"] }]),
    ];

    const results = search(documents, ["typescript"]);

    expect(results.map((r) => r.id)).toEqual(["alpha", "mid", "zeta"]);
  });

  it("is deterministic: identical input yields byte-identical output across repeated calls", () => {
    const documents = [
      doc("a", [{ name: "tag", weight: 100, tokens: ["typescript"] }]),
      doc("b", [{ name: "name", weight: 50, tokens: ["typescript"] }]),
    ];

    const first = search(documents, ["typescript"]);
    const second = search(documents, ["typescript"]);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("returns an empty array for an empty document list, no throw", () => {
    expect(() => search([], ["typescript"])).not.toThrow();
    expect(search([], ["typescript"])).toEqual([]);
  });

  it("returns an empty array for an empty query token list, no throw", () => {
    const documents = [doc("a", [{ name: "tag", weight: 100, tokens: ["typescript"] }])];

    expect(() => search(documents, [])).not.toThrow();
    expect(search(documents, [])).toEqual([]);
  });

  it("counts each query token once per field even if the field's token list repeats it", () => {
    const documents = [
      doc("repeated", [
        { name: "body", weight: 5, tokens: ["typescript", "typescript", "typescript"] },
      ]),
      doc("single", [{ name: "body", weight: 5, tokens: ["typescript"] }]),
    ];

    const results = search(documents, ["typescript"]);

    expect(results.find((r) => r.id === "repeated")?.score).toBe(5);
    expect(results.find((r) => r.id === "single")?.score).toBe(5);
  });

  it("includes a machine-readable match explanation per result: matched field and matched token", () => {
    const documents = [
      doc("proj", [
        { name: "tag", weight: 100, tokens: ["typescript"] },
        { name: "name", weight: 50, tokens: ["typescript", "pipeline"] },
      ]),
    ];

    const results = search(documents, ["typescript", "pipeline"]);

    expect(results[0]?.matches).toEqual([
      { field: "tag", token: "typescript" },
      { field: "name", token: "typescript" },
      { field: "name", token: "pipeline" },
    ]);
  });

  it("respects options.limit without changing the relative order of the results kept", () => {
    const documents = [
      doc("zeta", [{ name: "tag", weight: 100, tokens: ["typescript"] }]),
      doc("alpha", [{ name: "tag", weight: 100, tokens: ["typescript"] }]),
      doc("mid", [{ name: "tag", weight: 100, tokens: ["typescript"] }]),
    ];

    const unlimited = search(documents, ["typescript"]);
    const limited = search(documents, ["typescript"], { limit: 2 });

    expect(limited).toEqual(unlimited.slice(0, 2));
  });

  it("a limit greater than the result count returns every match, unmodified", () => {
    const documents = [doc("a", [{ name: "tag", weight: 100, tokens: ["typescript"] }])];

    const results = search(documents, ["typescript"], { limit: 50 });

    expect(results.map((r) => r.id)).toEqual(["a"]);
  });
});
