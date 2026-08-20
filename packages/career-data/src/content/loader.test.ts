import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadContentDir, validateContentDir } from "./loader.js";

const fixtureDir = (name: string) =>
  fileURLToPath(new URL(`./__fixtures__/${name}/`, import.meta.url));

describe("validateContentDir", () => {
  it("reports no errors for a fully valid content directory", () => {
    expect(validateContentDir(fixtureDir("valid-content"))).toEqual([]);
  });

  it("reports an empty-headline error with file path and field path for an invalid profile", () => {
    const errors = validateContentDir(fixtureDir("invalid-content"));
    const profileError = errors.find((error) => error.file === "profile.json");
    expect(profileError).toMatchObject({ file: "profile.json", path: "headline" });
  });

  it("reports a malformed startDate on the invalid experience fixture", () => {
    const errors = validateContentDir(fixtureDir("invalid-content"));
    const experienceError = errors.find((error) => error.file.startsWith("experience/"));
    expect(experienceError).toMatchObject({
      file: "experience/fixture-role.json",
      path: "startDate",
    });
  });

  it("reports an empty tech array on the invalid project MDX fixture", () => {
    const errors = validateContentDir(fixtureDir("invalid-content"));
    const projectError = errors.find((error) => error.file.startsWith("projects/"));
    expect(projectError).toMatchObject({ file: "projects/fixture-project.mdx", path: "tech" });
  });

  it("reports a malformed publishedDate on the invalid writing MDX fixture", () => {
    const errors = validateContentDir(fixtureDir("invalid-content"));
    const writingError = errors.find((error) => error.file.startsWith("writing/"));
    expect(writingError).toMatchObject({
      file: "writing/fixture-article.mdx",
      path: "publishedDate",
    });
  });

  it("reports an empty evidence array on an array-of-skills index, with the index in the path", () => {
    const errors = validateContentDir(fixtureDir("invalid-content"));
    const skillError = errors.find((error) => error.file === "skills.json");
    expect(skillError).toMatchObject({ file: "skills.json", path: "[0].evidence" });
  });

  it("reports an empty statement on the invalid gap fixture", () => {
    const errors = validateContentDir(fixtureDir("invalid-content"));
    const gapError = errors.find((error) => error.file === "gaps.json");
    expect(gapError).toMatchObject({ file: "gaps.json", path: "[0].statement" });
  });

  it("reports an endDate-before-startDate error on the invalid education fixture", () => {
    const errors = validateContentDir(fixtureDir("invalid-content"));
    const educationError = errors.find((error) => error.file === "education.json");
    expect(educationError).toMatchObject({ file: "education.json", path: "[0].endDate" });
  });

  it("reports every failure across a directory, not just the first", () => {
    const errors = validateContentDir(fixtureDir("multi-invalid-content"));
    const files = new Set(errors.map((error) => error.file));
    expect(files.has("profile.json")).toBe(true);
    expect(files.has("skills.json")).toBe(true);
    expect(files.has("experience/broken.json")).toBe(true);
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });

  it("reports malformed JSON as a file-level error rather than throwing", () => {
    const errors = validateContentDir(fixtureDir("multi-invalid-content"));
    const brokenFileError = errors.find((error) => error.file === "experience/broken.json");
    expect(brokenFileError?.message).toMatch(/JSON/i);
  });
});

describe("loadContentDir", () => {
  it("loads a fully valid content directory into a typed dataset", () => {
    const dataset = loadContentDir(fixtureDir("valid-content"));

    expect(dataset.profile?.id).toBe("profile-fixture");
    expect(dataset.experience).toEqual([
      expect.objectContaining({ id: "fixture-role-fixtureco-2020" }),
    ]);
    expect(dataset.projects).toEqual([expect.objectContaining({ id: "fixture-project" })]);
    expect(dataset.skills).toEqual([expect.objectContaining({ id: "fixture-skill" })]);
    expect(dataset.gaps).toEqual([expect.objectContaining({ id: "fixture-gap" })]);
    expect(dataset.education).toEqual([
      expect.objectContaining({ id: "fixture-degree-fixture-university" }),
    ]);
    expect(dataset.writing).toEqual([expect.objectContaining({ id: "fixture-article" })]);
  });

  it("merges MDX frontmatter with the trimmed body for projects and writing", () => {
    const dataset = loadContentDir(fixtureDir("valid-content"));

    expect(dataset.projects[0]?.body).toMatch(/Fake long-form body content/);
    expect(dataset.writing[0]?.body).toMatch(/Fake long-form article body/);
  });

  it("returns an empty dataset — not an error — for a directory with no content files yet", () => {
    const dataset = loadContentDir(fixtureDir("empty-content"));

    expect(dataset).toEqual({
      profile: undefined,
      experience: [],
      projects: [],
      skills: [],
      gaps: [],
      education: [],
      writing: [],
    });
  });

  it("throws a readable error naming the offending file instead of returning invalid data", () => {
    expect(() => loadContentDir(fixtureDir("invalid-content"))).toThrow(/profile\.json/);
  });
});
