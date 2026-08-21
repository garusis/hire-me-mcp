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

  it("returns undefined (unresolvable) for a profile citation, so the caller can fall back to plain text", () => {
    expect(
      resolveChatCitationHref({ entityType: "profile", entityId: "marcos" }, NO_WRITING),
    ).toBeUndefined();
  });

  it("returns undefined (unresolvable) for an education citation", () => {
    expect(
      resolveChatCitationHref({ entityType: "education", entityId: "some-degree" }, NO_WRITING),
    ).toBeUndefined();
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
