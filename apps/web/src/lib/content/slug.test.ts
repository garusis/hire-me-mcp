import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findBySlug, listSlugs, toSlug } from "./slug";

const SOURCE_PATH = path.join(process.cwd(), "src", "lib", "content", "slug.ts");

interface FixtureEntity {
  id: string;
  label: string;
}

const fixtures: FixtureEntity[] = [
  { id: "senior-engineer-acme-2021", label: "Senior Engineer @ Acme" },
  { id: "staff-engineer-globex-2023", label: "Staff Engineer @ Globex" },
];

describe("toSlug", () => {
  it("derives a URL-safe slug from an entity id via packages/core's slugify", () => {
    expect(toSlug("senior-engineer-acme-2021")).toBe("senior-engineer-acme-2021");
  });

  it("normalizes an id that is not already clean kebab-case", () => {
    expect(toSlug("  Senior Engineer -- Acme!! ")).toBe("senior-engineer-acme");
  });

  it("imports slugify from @hire-me-mcp/core/slugify, not the default barrel — so this module (reused client-side, via app/skills/citation-href.ts, by #70's chat surface) never pulls in @hire-me-mcp/core's node:fs-dependent repository code into a client bundle", () => {
    const source = readFileSync(SOURCE_PATH, "utf-8");
    expect(source).toMatch(/from\s+"@hire-me-mcp\/core\/slugify"/);
    expect(source).not.toMatch(/from\s+"@hire-me-mcp\/core"/);
  });
});

describe("findBySlug", () => {
  it("returns a found result with the matching value when the slug resolves", () => {
    const result = findBySlug(fixtures, "staff-engineer-globex-2023", (item) => item.id);

    expect(result).toEqual({
      found: true,
      slug: "staff-engineer-globex-2023",
      value: fixtures[1],
    });
  });

  it("returns a documented not-found result for an unknown slug, rather than throwing", () => {
    const result = findBySlug(fixtures, "does-not-exist", (item) => item.id);

    expect(result).toEqual({ found: false, slug: "does-not-exist" });
  });
});

describe("listSlugs", () => {
  it("maps every item's id to its slug, in the same order", () => {
    expect(listSlugs(fixtures, (item) => item.id)).toEqual([
      "senior-engineer-acme-2021",
      "staff-engineer-globex-2023",
    ]);
  });

  it("returns an empty array for an empty list", () => {
    expect(listSlugs([], (item: FixtureEntity) => item.id)).toEqual([]);
  });
});
