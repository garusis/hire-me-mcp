import { describe, expect, it } from "vitest";
import { classifyPath, mapSourceToTest, mapTestToSource, toRepoRelative } from "./pathMapping.js";

describe("toRepoRelative", () => {
  it("strips an absolute repo root prefix", () => {
    expect(toRepoRelative("/repo/packages/core/src/index.ts", "/repo")).toBe(
      "packages/core/src/index.ts",
    );
  });

  it("leaves an already-relative path untouched", () => {
    expect(toRepoRelative("packages/core/src/index.ts", "/repo")).toBe(
      "packages/core/src/index.ts",
    );
  });

  it("normalizes backslash separators", () => {
    expect(toRepoRelative("C:\\repo\\packages\\core\\src\\index.ts", "C:\\repo")).toBe(
      "packages/core/src/index.ts",
    );
  });
});

describe("classifyPath", () => {
  it("classifies a co-located test file as test", () => {
    expect(classifyPath("packages/core/src/index.test.ts")).toBe("test");
  });

  it("classifies a .tsx test file under apps/*/app as test", () => {
    expect(classifyPath("apps/web/app/page.test.tsx")).toBe("test");
  });

  it("classifies a package source file as source", () => {
    expect(classifyPath("packages/core/src/index.ts")).toBe("source");
  });

  it("classifies an apps/*/app source file as source", () => {
    expect(classifyPath("apps/web/app/page.tsx")).toBe("source");
  });

  it("classifies a nested source file as source", () => {
    expect(classifyPath("packages/career-data/src/schemas/experience.ts")).toBe("source");
  });

  it("classifies vitest.config.ts as other (config, not source)", () => {
    expect(classifyPath("packages/core/vitest.config.ts")).toBe("other");
  });

  it("classifies next.config.ts as other", () => {
    expect(classifyPath("apps/web/next.config.ts")).toBe("other");
  });

  it("classifies a .d.ts declaration file as other", () => {
    expect(classifyPath("apps/web/next-env.d.ts")).toBe("other");
  });

  it("classifies README.md as other", () => {
    expect(classifyPath("README.md")).toBe("other");
  });

  it("classifies a root-level ts file outside src/app as other", () => {
    expect(classifyPath("turbo.json")).toBe("other");
  });

  it("classifies tsconfig.json (non ts/tsx extension) as other", () => {
    expect(classifyPath("packages/core/tsconfig.json")).toBe("other");
  });
});

describe("mapSourceToTest", () => {
  it("maps a package .ts source file to its co-located .test.ts", () => {
    expect(mapSourceToTest("packages/core/src/index.ts")).toBe("packages/core/src/index.test.ts");
  });

  it("maps an apps/*/app .tsx source file to its co-located .test.tsx", () => {
    expect(mapSourceToTest("apps/web/app/page.tsx")).toBe("apps/web/app/page.test.tsx");
  });

  it("maps a nested source file preserving its directory", () => {
    expect(mapSourceToTest("packages/career-data/src/schemas/experience.ts")).toBe(
      "packages/career-data/src/schemas/experience.test.ts",
    );
  });

  it("returns null for a path that is not source (e.g. already a test file)", () => {
    expect(mapSourceToTest("packages/core/src/index.test.ts")).toBeNull();
  });

  it("returns null for a config file", () => {
    expect(mapSourceToTest("packages/core/vitest.config.ts")).toBeNull();
  });
});

describe("mapTestToSource", () => {
  it("maps a co-located test file back to its source file", () => {
    expect(mapTestToSource("packages/core/src/index.test.ts")).toBe("packages/core/src/index.ts");
  });

  it("maps a .tsx test file back to its source file", () => {
    expect(mapTestToSource("apps/web/app/page.test.tsx")).toBe("apps/web/app/page.tsx");
  });

  it("returns null for a path that is not a test file", () => {
    expect(mapTestToSource("packages/core/src/index.ts")).toBeNull();
  });

  it("round-trips with mapSourceToTest", () => {
    const source = "packages/core/src/index.ts";
    const test = mapSourceToTest(source);
    expect(test).not.toBeNull();
    expect(mapTestToSource(test as string)).toBe(source);
  });
});
