import { describe, expect, it } from "vitest";
import {
  getExperienceEntryView,
  getExperienceListView,
  getProfileView,
  getProjectDetailView,
  getProjectsListView,
  getSkillEvidenceView,
  getWritingEntryView,
  getWritingListView,
  listExperienceSlugs,
  listProjectSlugs,
  listWritingSlugs,
} from "./index";

describe("apps/web content layer public entry point", () => {
  it("re-exports every accessor together, wired against the real career-data content", () => {
    const profile = getProfileView();
    expect(profile.profile.id).toBeTruthy();

    const experienceSlugs = listExperienceSlugs();
    expect(experienceSlugs.length).toBeGreaterThan(0);
    const experienceEntry = getExperienceEntryView(experienceSlugs[0] as string);
    expect(experienceEntry.found).toBe(true);

    const projectSlugs = listProjectSlugs();
    expect(projectSlugs.length).toBeGreaterThan(0);
    const project = getProjectDetailView(projectSlugs[0] as string);
    expect(project.found).toBe(true);

    expect(listWritingSlugs()).toEqual([]);
    expect(getWritingListView().items).toEqual([]);
    expect(getWritingEntryView("anything")).toEqual({ found: false, slug: "anything" });

    expect(getExperienceListView().items.length).toBe(experienceSlugs.length);
    expect(getProjectsListView().items.length).toBe(projectSlugs.length);

    expect(getSkillEvidenceView("typescript").outcome.kind).toBe("claimed");
  });
});
