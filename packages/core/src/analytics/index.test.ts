import { describe, expect, it } from "vitest";
import {
  AnalyticsScrubError,
  bucketLatencyMs,
  classifyQuestionTheme,
  computeRetentionCutoff,
  createPostgresAnalyticsStore,
  deleteExpiredAnalyticsEvents,
  getUsageStats,
  insertQuestionEvent,
  insertToolEvent,
  LATENCY_BUCKETS,
  QUESTION_THEMES,
  RETENTION_WINDOW_DAYS,
  recordQuestionEvent,
  recordToolEvent,
  resetAnalyticsEvents,
  runRetentionJob,
  SURFACES,
  scrubQuestionEvent,
  scrubToolEvent,
  TOOL_OUTCOMES,
} from "./index.js";

describe("analytics module entry point", () => {
  it("re-exports the taxonomy, scrubber, repository, store and retention surface together", () => {
    expect(Array.isArray(SURFACES)).toBe(true);
    expect(Array.isArray(TOOL_OUTCOMES)).toBe(true);
    expect(Array.isArray(QUESTION_THEMES)).toBe(true);
    expect(Array.isArray(LATENCY_BUCKETS)).toBe(true);
    expect(typeof bucketLatencyMs).toBe("function");
    expect(typeof classifyQuestionTheme).toBe("function");
    expect(typeof scrubToolEvent).toBe("function");
    expect(typeof scrubQuestionEvent).toBe("function");
    expect(new AnalyticsScrubError("x")).toBeInstanceOf(Error);
    expect(typeof insertToolEvent).toBe("function");
    expect(typeof insertQuestionEvent).toBe("function");
    expect(typeof deleteExpiredAnalyticsEvents).toBe("function");
    expect(typeof resetAnalyticsEvents).toBe("function");
    expect(typeof createPostgresAnalyticsStore).toBe("function");
    expect(typeof recordToolEvent).toBe("function");
    expect(typeof recordQuestionEvent).toBe("function");
    expect(typeof RETENTION_WINDOW_DAYS).toBe("number");
    expect(typeof computeRetentionCutoff).toBe("function");
    expect(typeof runRetentionJob).toBe("function");
    expect(typeof getUsageStats).toBe("function");
  });
});
