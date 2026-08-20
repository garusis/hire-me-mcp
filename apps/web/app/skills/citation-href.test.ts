import { describe, expect, it } from "vitest";
import { resolveCitationHref } from "./citation-href";

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
});
