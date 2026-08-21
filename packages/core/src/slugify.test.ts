import { describe, expect, it } from "vitest";
import { slugify } from "./slugify.js";

/**
 * `slugify` moved into its own leaf module (out of `index.ts`, which
 * re-exports it unchanged — see `index.test.ts`'s own `slugify` suite,
 * still passing against the same behavior) so it can be reached without
 * pulling in `repository.ts`'s `node:fs`/`node:path` dependency. That
 * matters for `apps/web/app/skills/citation-href.ts` (#30, reused
 * client-side by the chat surface's `resolve-chat-citation-href.ts`, #70):
 * importing anything from `@hire-me-mcp/core`'s default barrel drags in
 * `createContentCareerDataRepository`'s Node-only file-reading code, which
 * fails a Next.js client-component build. `@hire-me-mcp/core/slugify`
 * (see `package.json`'s `exports` map) is the client-safe path to this one
 * pure function.
 */
describe("slugify (leaf module)", () => {
  it("lowercases and hyphenates whitespace-separated words", () => {
    expect(slugify("Hire Me MCP")).toBe("hire-me-mcp");
  });

  it("collapses runs of non-alphanumeric characters into a single hyphen", () => {
    expect(slugify("  Senior  Engineer -- Full/Stack!! ")).toBe("senior-engineer-full-stack");
  });

  it("strips leading and trailing hyphens", () => {
    expect(slugify("---already-slugged---")).toBe("already-slugged");
  });

  it("returns an empty string when there is nothing alphanumeric to keep", () => {
    expect(slugify("!!!")).toBe("");
  });
});
