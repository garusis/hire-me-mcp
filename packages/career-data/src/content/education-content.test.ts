import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { idSchema } from "../schemas/index.js";
import { validateContentDir } from "./loader.js";

/**
 * Invariant tests over the real, authored `content/education.json` (#48).
 */
const contentDir = fileURLToPath(new URL("../../content/", import.meta.url));

interface EducationRecord {
  id: string;
  startDate?: string;
  endDate?: string;
}

function readEducationEntries(): EducationRecord[] {
  const raw = fs.readFileSync(path.join(contentDir, "education.json"), "utf-8");
  return JSON.parse(raw);
}

describe("real content: education.json", () => {
  it("validates against the EducationEntry schema", () => {
    const errors = validateContentDir(contentDir).filter(
      (error) => error.file === "education.json",
    );
    expect(errors).toEqual([]);
  });

  it("is a non-empty list", () => {
    expect(readEducationEntries().length).toBeGreaterThan(0);
  });

  it("has ids matching the documented slug pattern, unique across all entries", () => {
    const ids = readEducationEntries().map((entry) => entry.id);
    for (const id of ids) {
      expect(idSchema.safeParse(id).success).toBe(true);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is chronologically consistent for entries where both dates are known", () => {
    for (const entry of readEducationEntries()) {
      if (entry.startDate !== undefined && entry.endDate !== undefined) {
        expect(entry.endDate >= entry.startDate).toBe(true);
      }
    }
  });
});
