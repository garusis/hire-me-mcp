import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  citationSchema,
  formatYearRange,
  loadContentDir,
  resolveDefaultContentDir,
} from "./index.js";

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

  it("resolveDefaultContentDir points at this package's own content/ directory", () => {
    const contentDir = resolveDefaultContentDir();
    expect(contentDir.endsWith("content/") || contentDir.endsWith("content")).toBe(true);
    expect(existsSync(contentDir)).toBe(true);
  });
});
