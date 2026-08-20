import { describe, expect, it } from "vitest";
import { buildAliasIndex, search, tokenize } from "./index.js";

describe("search module entry point", () => {
  it("re-exports tokenize, buildAliasIndex and search together, composable end to end", () => {
    const aliasIndex = buildAliasIndex([{ canonical: "typescript", aliases: ["ts"] }]);
    const queryTokens = tokenize("TS!").map((token) => aliasIndex.resolve(token) ?? token);

    const results = search(
      [{ id: "doc-a", fields: [{ name: "tag", weight: 100, tokens: ["typescript"] }] }],
      queryTokens,
    );

    expect(queryTokens).toEqual(["typescript"]);
    expect(results.map((r) => r.id)).toEqual(["doc-a"]);
  });
});
