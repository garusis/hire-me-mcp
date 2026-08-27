import { CITABLE_ENTITY_TYPES, type CitationMarker } from "@hire-me-mcp/agent/citations";
import { describe, expect, it } from "vitest";
import type { WritingEntry } from "../../src/lib/content";
import { resolveChatCitationHref } from "./resolve-chat-citation-href";

const NO_WRITING: readonly WritingEntry[] = [];

describe("resolveChatCitationHref", () => {
  it("resolves an experience citation to the /experience anchor, reusing the /skills href mapping", () => {
    expect(
      resolveChatCitationHref({ entityType: "experience", entityId: "house-numbers" }, NO_WRITING),
    ).toBe("/experience#house-numbers");
  });

  it("resolves a project citation to its /projects/[slug] route", () => {
    expect(resolveChatCitationHref({ entityType: "project", entityId: "cowork" }, NO_WRITING)).toBe(
      "/projects/cowork",
    );
  });

  it("resolves a skill citation to the /skills anchor", () => {
    expect(resolveChatCitationHref({ entityType: "skill", entityId: "golang" }, NO_WRITING)).toBe(
      "/skills#golang",
    );
  });

  it("resolves a gap citation to the /skills gap anchor", () => {
    expect(resolveChatCitationHref({ entityType: "gap", entityId: "golang" }, NO_WRITING)).toBe(
      "/skills#gap-golang",
    );
  });

  it("resolves a writing citation to the matching entry's canonical URL when it has one", () => {
    const entries: readonly WritingEntry[] = [
      {
        id: "post-1",
        title: "A post",
        summary: "summary",
        publishedDate: "2024-01-01",
        body: "Body text.",
        url: "https://example.com/post-1",
      },
    ];
    expect(resolveChatCitationHref({ entityType: "writing", entityId: "post-1" }, entries)).toBe(
      "https://example.com/post-1",
    );
  });

  // Issue 227: these three used to return `undefined` on the (wrong) belief
  // that the agent's tool set never emitted them. `get-profile`,
  // `list-recommendations` and `search-career` over education chunks all do,
  // so the chat dropped the citation on most answers.
  it("resolves a profile citation to the home page's profile section", () => {
    expect(resolveChatCitationHref({ entityType: "profile", entityId: "marcos" }, NO_WRITING)).toBe(
      "/#profile",
    );
  });

  it("resolves an education citation to its credential card on /experience", () => {
    expect(
      resolveChatCitationHref(
        { entityType: "education", entityId: "unad-bs-systems-engineering" },
        NO_WRITING,
      ),
    ).toBe("/experience#unad-bs-systems-engineering");
  });

  it("resolves a recommendation citation to its card on /recommendations", () => {
    expect(
      resolveChatCitationHref(
        { entityType: "recommendation", entityId: "some-recommender" },
        NO_WRITING,
      ),
    ).toBe("/recommendations#some-recommender");
  });

  // The drift detector this bug needed: every type the shared marker format
  // can carry must map to a real site surface, or answers quietly lose their
  // citations again.
  it("resolves every citable entity type the agent can emit, to something other than the bare home page", () => {
    for (const entityType of CITABLE_ENTITY_TYPES) {
      const href = resolveChatCitationHref({ entityType, entityId: "some-entity" }, NO_WRITING);
      expect(href, `"${entityType}" citations are unresolvable`).toBeDefined();
      expect(href, `"${entityType}" citations fall back to the home page`).not.toBe("/");
    }
  });

  it("returns undefined only for an entity type outside the shared marker format, so no broken link is ever rendered", () => {
    const unknown = { entityType: "sighting", entityId: "whatever" } as unknown as CitationMarker;
    expect(resolveChatCitationHref(unknown, NO_WRITING)).toBeUndefined();
  });

  it("carries a #fragment through to the resolved href when the marker has one", () => {
    expect(
      resolveChatCitationHref(
        { entityType: "experience", entityId: "house-numbers", fragment: "impact" },
        NO_WRITING,
      ),
    ).toBe("/experience#house-numbers");
  });
});
