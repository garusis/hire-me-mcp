import { describe, expect, it } from "vitest";
import {
  bucketLatencyMs,
  LATENCY_BUCKETS,
  QUESTION_THEMES,
  SURFACES,
  TOOL_OUTCOMES,
} from "./taxonomy.js";

describe("SURFACES / TOOL_OUTCOMES / QUESTION_THEMES", () => {
  it("mcp and chat are the only surfaces", () => {
    expect(SURFACES).toEqual(["mcp", "chat"]);
  });

  it("success, invalid_input, domain_error, internal_error, rate_limited are the only tool outcomes", () => {
    expect(TOOL_OUTCOMES).toEqual([
      "success",
      "invalid_input",
      "domain_error",
      "internal_error",
      "rate_limited",
    ]);
  });

  it("has a fixed, documented taxonomy including an other bucket", () => {
    expect(QUESTION_THEMES).toContain("other");
    expect(QUESTION_THEMES.length).toBeGreaterThan(1);
  });
});

describe("bucketLatencyMs", () => {
  it("buckets sub-100ms latencies", () => {
    expect(bucketLatencyMs(0)).toBe("under_100ms");
    expect(bucketLatencyMs(99)).toBe("under_100ms");
  });

  it("buckets sub-500ms latencies", () => {
    expect(bucketLatencyMs(100)).toBe("under_500ms");
    expect(bucketLatencyMs(499)).toBe("under_500ms");
  });

  it("buckets sub-2s latencies", () => {
    expect(bucketLatencyMs(500)).toBe("under_2s");
    expect(bucketLatencyMs(1999)).toBe("under_2s");
  });

  it("buckets sub-10s latencies", () => {
    expect(bucketLatencyMs(2000)).toBe("under_10s");
    expect(bucketLatencyMs(9999)).toBe("under_10s");
  });

  it("buckets everything at or above 10s into the top bucket", () => {
    expect(bucketLatencyMs(10_000)).toBe("over_10s");
    expect(bucketLatencyMs(60_000)).toBe("over_10s");
  });

  it("is deterministic and part of the fixed bucket taxonomy", () => {
    for (const ms of [0, 50, 250, 1000, 5000, 20_000]) {
      expect(LATENCY_BUCKETS).toContain(bucketLatencyMs(ms));
    }
  });

  it("treats a negative latency as the smallest bucket rather than throwing", () => {
    expect(bucketLatencyMs(-5)).toBe("under_100ms");
  });
});
