import { getExperience } from "@hire-me-mcp/core";
import { describe, expect, it } from "vitest";
import { getExperienceEntryView, getExperienceListView, listExperienceSlugs } from "./experience";
import { getCareerDataRepository } from "./repository";
import { toSlug } from "./slug";

describe("getExperienceListView", () => {
  it("wraps packages/core's getExperience(), passing entry data through unmodified and in the same order", () => {
    const expected = getExperience(getCareerDataRepository());

    const view = getExperienceListView();

    expect(view.items.map((item) => item.entry)).toEqual(expected.data);
  });

  it("pairs every entry with the citation packages/core built for it, unmodified", () => {
    const expected = getExperience(getCareerDataRepository());

    const view = getExperienceListView();

    expect(view.items.map((item) => item.citation)).toEqual(expected.citations);
    expect(view.citations).toEqual(expected.citations);
  });

  it("derives a stable slug for every entry from its id", () => {
    const view = getExperienceListView();

    for (const item of view.items) {
      expect(item.slug).toBe(toSlug(item.entry.id));
    }
  });

  it("forwards an ExperienceFilter to packages/core's getExperience()", () => {
    const view = getExperienceListView({ company: "does-not-exist-anywhere" });

    expect(view.items).toEqual([]);
    expect(view.citations).toEqual([]);
  });
});

describe("listExperienceSlugs", () => {
  it("returns one slug per experience entry, for generateStaticParams", () => {
    const view = getExperienceListView();

    expect(listExperienceSlugs()).toEqual(view.items.map((item) => item.slug));
  });
});

describe("getExperienceEntryView", () => {
  it("returns the matching entry and its citation for a known slug", () => {
    const [first] = getExperienceListView().items;
    if (first === undefined) {
      throw new Error("fixture error: expected at least one real experience entry");
    }

    const result = getExperienceEntryView(first.slug);

    expect(result).toEqual({
      found: true,
      slug: first.slug,
      value: { entry: first.entry, citation: first.citation },
    });
  });

  it("returns the documented not-found result for an unknown slug, rather than throwing", () => {
    const result = getExperienceEntryView("no-such-experience-entry");

    expect(result).toEqual({ found: false, slug: "no-such-experience-entry" });
  });
});
