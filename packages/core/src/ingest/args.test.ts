import { describe, expect, it } from "vitest";
import { InvalidIngestArgError, parseIngestArgs } from "./args.js";

describe("parseIngestArgs", () => {
  it("defaults to dryRun: false, full: false with no flags", () => {
    expect(parseIngestArgs([])).toEqual({ dryRun: false, full: false });
  });

  it("recognizes --dry-run", () => {
    expect(parseIngestArgs(["--dry-run"])).toEqual({ dryRun: true, full: false });
  });

  it("recognizes --full", () => {
    expect(parseIngestArgs(["--full"])).toEqual({ dryRun: false, full: true });
  });

  it("recognizes both flags together, in either order", () => {
    expect(parseIngestArgs(["--dry-run", "--full"])).toEqual({ dryRun: true, full: true });
    expect(parseIngestArgs(["--full", "--dry-run"])).toEqual({ dryRun: true, full: true });
  });

  it("throws InvalidIngestArgError for an unrecognized flag", () => {
    expect(() => parseIngestArgs(["--bogus"])).toThrow(InvalidIngestArgError);
  });

  it("ignores a leading `--` passthrough separator (pnpm's `pnpm ingest -- --dry-run` forwards it)", () => {
    expect(parseIngestArgs(["--", "--dry-run"])).toEqual({ dryRun: true, full: false });
  });
});
