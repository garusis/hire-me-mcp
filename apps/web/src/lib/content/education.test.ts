import { listEducation } from "@hire-me-mcp/core";
import { describe, expect, it } from "vitest";
import { getEducationListView } from "./education";
import { getCareerDataRepository } from "./repository";

describe("getEducationListView (issue 231)", () => {
  it("returns every education record the domain layer lists, in the same stable order", () => {
    const view = getEducationListView();
    const domain = listEducation(getCareerDataRepository());

    expect(view.items.map((item) => item.entry)).toEqual(domain.data);
  });

  it("pairs each entry with the citation resolving to it", () => {
    const view = getEducationListView();

    for (const item of view.items) {
      expect(item.citation.entityType).toBe("education");
      expect(item.citation.entityId).toBe(item.entry.id);
      expect(item.citation.label.length).toBeGreaterThan(0);
    }
  });

  it("exposes the real authored dataset — the same records the CV PDF and list-education tool publish", () => {
    const { items } = getEducationListView();

    // The dataset is authored non-empty; the site section renders from it.
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.entry.institution.length).toBeGreaterThan(0);
      expect(item.entry.credential.length).toBeGreaterThan(0);
    }
  });
});
