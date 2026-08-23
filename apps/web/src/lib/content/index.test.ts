import { describe, expect, it } from "vitest";
import {
  getCvView,
  getExperienceEntryView,
  getExperienceListView,
  getGapsListView,
  getProfileView,
  getProjectDetailView,
  getProjectsListView,
  getSkillEvidenceView,
  getSkillsListView,
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

    const skills = getSkillsListView().items;
    expect(skills.length).toBeGreaterThan(0);

    const gaps = getGapsListView().items;
    expect(gaps.length).toBe(8);

    const cv = getCvView();
    expect(cv.profile.id).toBe(profile.profile.id);
    expect(cv.filename).toMatch(/-cv\.pdf$/);
  });
});
