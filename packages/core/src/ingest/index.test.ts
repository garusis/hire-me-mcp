import { describe, expect, it } from "vitest";
import {
  computeIngestDiff,
  formatIngestSummary,
  InvalidIngestArgError,
  parseIngestArgs,
  runIngest,
} from "./index.js";

describe("ingest module entry point", () => {
  it("re-exports the diff, orchestration, args, and summary surface together", () => {
    expect(typeof computeIngestDiff).toBe("function");
    expect(typeof runIngest).toBe("function");
    expect(typeof parseIngestArgs).toBe("function");
    expect(typeof formatIngestSummary).toBe("function");
    expect(new InvalidIngestArgError("x")).toBeInstanceOf(Error);
  });
});
