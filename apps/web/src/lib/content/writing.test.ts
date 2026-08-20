import {
  buildCitation,
  createInMemoryCareerDataRepository,
  emptyCareerDataset,
} from "@hire-me-mcp/core";
import { describe, expect, it } from "vitest";
import { getCareerDataRepository } from "./repository";
import { toSlug } from "./slug";
import { getWritingEntryView, getWritingListView, listWritingSlugs } from "./writing";

const fixtureWritingEntry = {
  id: "fixture-writing-entry",
  title: "Fixture Writing Entry",
  publishedDate: "2024-01-15",
  summary: "A fixture summary.",
  body: "Fixture body prose.",
};

describe("getWritingListView", () => {
  it("lists every writing entry from the real (currently empty) career-data content", () => {
    const view = getWritingListView();

    expect(view.items).toEqual([]);
    expect(view.citations).toEqual([]);
  });

  it("passes writing entry data through unmodified and builds a citation to each via packages/core's buildCitation", () => {
    const repository = createInMemoryCareerDataRepository({
      ...emptyCareerDataset(),
      writing: [fixtureWritingEntry],
    });

    const view = getWritingListView(repository);

    expect(view.items).toEqual([
      {
        slug: toSlug(fixtureWritingEntry.id),
        entry: fixtureWritingEntry,
        citation: buildCitation(repository, "writing", fixtureWritingEntry.id),
      },
    ]);
    expect(view.citations).toEqual(view.items.map((item) => item.citation));
  });
});

describe("listWritingSlugs", () => {
  it("returns one slug per writing entry, for generateStaticParams", () => {
    const repository = createInMemoryCareerDataRepository({
      ...emptyCareerDataset(),
      writing: [fixtureWritingEntry],
    });

    expect(listWritingSlugs(repository)).toEqual([toSlug(fixtureWritingEntry.id)]);
  });

  it("returns an empty array against the real (currently empty) career-data content", () => {
    expect(listWritingSlugs()).toEqual([]);
  });
});

describe("getWritingEntryView", () => {
  it("returns the matching entry and its citation for a known slug", () => {
    const repository = createInMemoryCareerDataRepository({
      ...emptyCareerDataset(),
      writing: [fixtureWritingEntry],
    });
    const slug = toSlug(fixtureWritingEntry.id);

    const result = getWritingEntryView(slug, repository);

    expect(result).toEqual({
      found: true,
      slug,
      value: {
        entry: fixtureWritingEntry,
        citation: buildCitation(repository, "writing", fixtureWritingEntry.id),
      },
    });
  });

  it("returns the documented not-found result for an unknown slug, rather than throwing", () => {
    const result = getWritingEntryView("no-such-writing-entry", getCareerDataRepository());

    expect(result).toEqual({ found: false, slug: "no-such-writing-entry" });
  });

  it("defaults to the real career-data repository when none is given", () => {
    const result = getWritingEntryView("no-such-writing-entry");

    expect(result).toEqual({ found: false, slug: "no-such-writing-entry" });
  });
});
