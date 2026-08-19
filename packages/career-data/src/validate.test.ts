import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { formatValidationReport, runValidate } from "./validate.js";

const fixtureDir = (name: string) =>
  fileURLToPath(new URL(`./content/__fixtures__/${name}/`, import.meta.url));

describe("runValidate", () => {
  it("returns ok: true and no errors for a fully valid content directory", () => {
    const result = runValidate(fixtureDir("valid-content"));
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it("returns ok: false with every error for an invalid content directory", () => {
    const result = runValidate(fixtureDir("invalid-content"));
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });

  it("reports every failure across a directory with multiple bad files, not just the first", () => {
    const result = runValidate(fixtureDir("multi-invalid-content"));
    const files = new Set(result.errors.map((error) => error.file));
    expect(files.size).toBeGreaterThanOrEqual(3);
  });
});

describe("formatValidationReport", () => {
  it("includes the file path, field path and message for each error", () => {
    const { errors } = runValidate(fixtureDir("invalid-content"));
    const report = formatValidationReport(errors);
    for (const error of errors) {
      expect(report).toContain(error.file);
      expect(report).toContain(error.path);
      expect(report).toContain(error.message);
    }
  });

  it("reports a clean summary when there are no errors", () => {
    expect(formatValidationReport([])).toMatch(/no errors/i);
  });
});
