import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCitationHref } from "./citation-href";

const SOURCE_PATH = path.join(process.cwd(), "app", "skills", "citation-href.ts");

describe("resolveCitationHref", () => {
  it("points an experience citation at the matching anchor on /experience", () => {
    const href = resolveCitationHref(
      {
        entityType: "experience",
        entityId: "house-numbers-2022-role",
        label: "Role, House Numbers",
      },
      [],
    );

    expect(href).toBe("/experience#house-numbers-2022-role");
  });

  it("points a project citation at its /projects/[slug] detail route", () => {
    const href = resolveCitationHref(
      { entityType: "project", entityId: "cowork", label: "cowork" },
      [],
    );

    expect(href).toBe("/projects/cowork");
  });

  it("points a skill citation at the matching anchor on /skills", () => {
    const href = resolveCitationHref(
      { entityType: "skill", entityId: "typescript", label: "TypeScript" },
      [],
    );

    expect(href).toBe("/skills#typescript");
  });

  it("points a gap citation at the matching anchor in the /skills gap section", () => {
    const href = resolveCitationHref(
      { entityType: "gap", entityId: "golang", label: "Go (Golang)" },
      [],
    );

    expect(href).toBe("/skills#gap-golang");
  });

  it("points a writing citation with a canonical external URL at that URL", () => {
    const href = resolveCitationHref(
      { entityType: "writing", entityId: "some-post", label: "Some Post" },
      [
        {
          id: "some-post",
          title: "Some Post",
          publishedDate: "2024-01-01",
          summary: "summary",
          body: "body",
          url: "https://example.com/some-post",
        },
      ],
    );

    expect(href).toBe("https://example.com/some-post");
  });

  it("points a writing citation with no external URL at its anchor on /writing, for locally-hosted entries", () => {
    const href = resolveCitationHref(
      { entityType: "writing", entityId: "local-post", label: "Local Post" },
      [
        {
          id: "local-post",
          title: "Local Post",
          publishedDate: "2024-01-01",
          summary: "summary",
          body: "body",
        },
      ],
    );

    expect(href).toBe("/writing#local-post");
  });

  it("falls back to /writing for a writing citation whose entry can't be resolved", () => {
    const href = resolveCitationHref(
      { entityType: "writing", entityId: "missing", label: "Missing" },
      [],
    );

    expect(href).toBe("/writing");
  });

  it("falls back to the home page for an entity type with no dedicated citation surface", () => {
    const href = resolveCitationHref(
      { entityType: "profile", entityId: "marcos", label: "Marcos" },
      [],
    );

    expect(href).toBe("/");
  });

  it("has no runtime dependency on the \"server-only\"-tagged content barrel, so it's safe to import from a client component (#70's chat surface reuses it via resolve-chat-citation-href.ts)", () => {
    // `../../src/lib/content`'s index.ts (and every module it re-exports,
    // e.g. `writing.ts`) starts with `import "server-only"` — a value
    // import of anything from that barrel pulls the whole module graph,
    // "server-only" included, into any bundle that reaches this file. A
    // Next.js client-component build fails hard the moment that happens.
    // `toSlug` must therefore come from its own leaf module
    // (`../../src/lib/content/slug`), never from the barrel; `WritingEntry`
    // may still come from the barrel because a `import type` is erased
    // entirely at compile time and carries no runtime import.
    const source = readFileSync(SOURCE_PATH, "utf-8");
    expect(source).toMatch(
      /import\s+type\s*\{[^}]*WritingEntry[^}]*\}\s*from\s*"\.\.\/\.\.\/src\/lib\/content"/,
    );
    expect(source).toMatch(
      /import\s*\{\s*toSlug\s*\}\s*from\s*"\.\.\/\.\.\/src\/lib\/content\/slug"/,
    );
    expect(source).not.toMatch(
      /import\s*\{[^}]*\btoSlug\b[^}]*\}\s*from\s*"\.\.\/\.\.\/src\/lib\/content"/,
    );
  });
});
