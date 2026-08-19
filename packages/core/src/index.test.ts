import { describe, expect, it } from "vitest";
import { slugify } from "./index.js";

describe("slugify", () => {
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
