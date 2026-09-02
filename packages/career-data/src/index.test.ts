import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COMPETENCIES,
  careerStorySchema,
  citationSchema,
  competencySchema,
  formatYearRange,
  isCompetency,
  loadContentDir,
  loadStoryPreservationMap,
  resolveDefaultContentDir,
  storyPreservationMapSchema,
} from "./index.js";

/**
 * This package's own directory on disk (`packages/career-data`), independent
 * of `resolveDefaultContentDir()` — used to `process.chdir()` into realistic
 * monorepo layouts (repo root, `apps/web`) without depending on the function
 * under test to find it.
 */
const packageDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = path.join(packageDir, "..", "..", "..");
const appsWebDir = path.join(repoRoot, "apps", "web");

/**
 * Lets tests simulate webpack's `import.meta.url`-freezing bundling failure
 * mode (see the describe block below) by swapping in a bogus path for
 * `fileURLToPath`'s return value, without touching every other `node:url`
 * export or every other call site in this file. `vi.hoisted` is required
 * because `vi.mock`'s factory runs before this file's own top-level
 * `const`s would otherwise be initialized.
 */
const urlOverride = vi.hoisted(() => ({ brokenPath: undefined as string | undefined }));

vi.mock("node:url", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:url")>();
  return {
    ...actual,
    fileURLToPath: (url: Parameters<typeof actual.fileURLToPath>[0]) =>
      urlOverride.brokenPath ?? actual.fileURLToPath(url),
  };
});

describe("formatYearRange", () => {
  it("formats a closed range", () => {
    expect(formatYearRange(2019, 2021)).toBe("2019 – 2021");
  });

  it("formats an open-ended range as Present when end is omitted", () => {
    expect(formatYearRange(2021)).toBe("2021 – Present");
  });

  it("rejects a non-integer start year", () => {
    expect(() => formatYearRange(2019.5)).toThrow(RangeError);
  });

  it("rejects an end year before the start year", () => {
    expect(() => formatYearRange(2021, 2019)).toThrow(RangeError);
  });
});

describe("public entry point", () => {
  it("re-exports the #290 story-preservation map loader and schema", () => {
    expect(storyPreservationMapSchema).toBeDefined();
    expect(loadStoryPreservationMap(resolveDefaultContentDir()).length).toBeGreaterThan(0);
  });

  it("re-exports the citation schema for downstream consumers like packages/core", () => {
    const result = citationSchema.safeParse({
      entityType: "experience",
      entityId: "fixture-role",
      label: "Fixture Role",
    });
    expect(result.success).toBe(true);
  });

  it("re-exports loadContentDir for downstream consumers like packages/core", () => {
    const fixtureDir = fileURLToPath(
      new URL("./content/__fixtures__/valid-content/", import.meta.url),
    );
    expect(loadContentDir(fixtureDir).profile?.id).toBe("profile-fixture");
  });

  it("re-exports the story schema and the competency taxonomy (#289)", () => {
    expect(
      citationSchema.safeParse({ entityType: "story", entityId: "s", label: "S" }).success,
    ).toBe(true);
    expect(COMPETENCIES).toContain("leadership");
    expect(competencySchema.safeParse("leadership").success).toBe(true);
    expect(isCompetency("leadership")).toBe(true);
    expect(careerStorySchema.safeParse({}).success).toBe(false);
    const fixtureDir = fileURLToPath(
      new URL("./content/__fixtures__/valid-content/", import.meta.url),
    );
    expect(loadContentDir(fixtureDir).stories.map((story) => story.id)).toEqual(["fixture-story"]);
  });

  it("resolveDefaultContentDir points at this package's own content/ directory", () => {
    const contentDir = resolveDefaultContentDir();
    expect(contentDir.endsWith("content/") || contentDir.endsWith("content")).toBe(true);
    expect(existsSync(contentDir)).toBe(true);
  });
});

/**
 * Regression coverage for #113: on Vercel, this package's `dist/index.js` is
 * webpack-bundled into the `/api/mcp` route's server chunk rather than
 * required as a standalone file. Webpack freezes `import.meta.url` to a
 * *build-time* string literal — the module's absolute path on the machine
 * that ran `next build` — which does not exist in the Lambda's separate
 * runtime filesystem, so `resolveDefaultContentDir()`'s old
 * `import.meta.url`-only resolution silently pointed at a nonexistent
 * directory in production (confirmed via a local sandbox reproduction: see
 * PR description). `process.cwd()`, unlike `import.meta.url`, is evaluated
 * at runtime, not frozen at build time, so cwd-relative candidates survive
 * bundling. These tests mock `node:url`'s `fileURLToPath` to simulate a
 * frozen/wrong `import.meta.url` (the exact bundling failure mode) and
 * assert `resolveDefaultContentDir()` still finds the real content
 * directory via a cwd-relative candidate instead.
 */
describe("resolveDefaultContentDir — layout robustness (#113)", () => {
  const originalCwd = process.cwd();

  beforeEach(() => {
    urlOverride.brokenPath = undefined;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    urlOverride.brokenPath = undefined;
  });

  it("resolves via a cwd-relative candidate when cwd is the repo root, even with a broken import.meta.url", () => {
    urlOverride.brokenPath = "/nonexistent-build-machine-path/career-data/dist/index.js";
    process.chdir(repoRoot);

    const contentDir = resolveDefaultContentDir();

    expect(existsSync(path.join(contentDir, "profile.json"))).toBe(true);
  });

  it("resolves via a cwd-relative candidate when cwd is apps/web (the Vercel Root Directory), even with a broken import.meta.url", () => {
    urlOverride.brokenPath = "/nonexistent-build-machine-path/career-data/dist/index.js";
    process.chdir(appsWebDir);

    const contentDir = resolveDefaultContentDir();

    expect(existsSync(path.join(contentDir, "profile.json"))).toBe(true);
  });

  it("throws a descriptive error naming every attempted path when no candidate — cwd-relative or import.meta.url-based — resolves", () => {
    urlOverride.brokenPath = "/nonexistent-build-machine-path/career-data/dist/index.js";
    process.chdir(path.join(originalCwd, ".."));

    expect(() => resolveDefaultContentDir()).toThrow(/could not locate.*content/i);
    expect(() => resolveDefaultContentDir()).toThrow(/nonexistent-build-machine-path/);
  });
});
