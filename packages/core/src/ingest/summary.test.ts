import { describe, expect, it } from "vitest";
import { formatIngestSummary } from "./summary.js";

describe("formatIngestSummary", () => {
  it("reports counts, embedding calls, and wall time for a normal run", () => {
    const line = formatIngestSummary({
      inserted: 3,
      updated: 1,
      deleted: 2,
      unchanged: 10,
      embeddingCalls: 1,
      wallTimeMs: 1234,
      dryRun: false,
    });

    expect(line).toMatch(/inserted: 3/);
    expect(line).toMatch(/updated: 1/);
    expect(line).toMatch(/deleted: 2/);
    expect(line).toMatch(/unchanged: 10/);
    expect(line).toMatch(/embedding calls: 1/);
    expect(line).toMatch(/1234ms/);
  });

  it("prefixes the summary with [dry-run] when dryRun is true", () => {
    const line = formatIngestSummary({
      inserted: 1,
      updated: 0,
      deleted: 0,
      unchanged: 0,
      embeddingCalls: 0,
      wallTimeMs: 5,
      dryRun: true,
    });

    expect(line).toMatch(/^\[dry-run\]/);
  });

  it("does not prefix a real run", () => {
    const line = formatIngestSummary({
      inserted: 0,
      updated: 0,
      deleted: 0,
      unchanged: 5,
      embeddingCalls: 0,
      wallTimeMs: 5,
      dryRun: false,
    });

    expect(line.startsWith("[dry-run]")).toBe(false);
  });
});
