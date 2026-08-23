import type { AnalyticsStore } from "@hire-me-mcp/core/analytics";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as getAnalyticsStoreModule from "./get-analytics-store.js";
import { recordChatQuestionEvent, recordChatToolEvent, recordMcpToolEvent } from "./record.js";

vi.mock("./get-analytics-store.js", () => ({ getAnalyticsStore: vi.fn() }));

describe("recordMcpToolEvent", () => {
  beforeEach(() => {
    vi.mocked(getAnalyticsStoreModule.getAnalyticsStore).mockReset();
  });

  it("does nothing (and does not throw) when no store is available", () => {
    vi.mocked(getAnalyticsStoreModule.getAnalyticsStore).mockReturnValue(undefined);

    expect(() => recordMcpToolEvent("get-profile", "success", 12)).not.toThrow();
  });

  it("records a surface=mcp tool event on the store when one is available", async () => {
    const recordToolEvent = vi.fn().mockResolvedValue(undefined);
    const store: AnalyticsStore = { recordToolEvent, recordQuestionEvent: vi.fn() };
    vi.mocked(getAnalyticsStoreModule.getAnalyticsStore).mockReturnValue(store);

    recordMcpToolEvent("get-profile", "success", 12);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(recordToolEvent).toHaveBeenCalledWith({
      surface: "mcp",
      toolName: "get-profile",
      outcome: "success",
      latencyMs: 12,
    });
  });

  it("does not throw and logs when getAnalyticsStore() itself throws synchronously", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(getAnalyticsStoreModule.getAnalyticsStore).mockImplementation(() => {
      throw new Error("boom");
    });

    expect(() => recordMcpToolEvent("get-profile", "internal_error", 5)).not.toThrow();
    errorSpy.mockRestore();
  });
});

describe("recordChatToolEvent", () => {
  afterEach(() => vi.mocked(getAnalyticsStoreModule.getAnalyticsStore).mockReset());

  it("records a surface=chat tool event on the store when one is available", async () => {
    const recordToolEvent = vi.fn().mockResolvedValue(undefined);
    const store: AnalyticsStore = { recordToolEvent, recordQuestionEvent: vi.fn() };
    vi.mocked(getAnalyticsStoreModule.getAnalyticsStore).mockReturnValue(store);

    recordChatToolEvent("search-career", "success", 300);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(recordToolEvent).toHaveBeenCalledWith({
      surface: "chat",
      toolName: "search-career",
      outcome: "success",
      latencyMs: 300,
    });
  });
});

describe("recordChatQuestionEvent", () => {
  afterEach(() => vi.mocked(getAnalyticsStoreModule.getAnalyticsStore).mockReset());

  it("does nothing when no store is available", () => {
    vi.mocked(getAnalyticsStoreModule.getAnalyticsStore).mockReturnValue(undefined);

    expect(() => recordChatQuestionEvent("experience", 900, true)).not.toThrow();
  });

  it("records a question event on the store when one is available", async () => {
    const recordQuestionEvent = vi.fn().mockResolvedValue(undefined);
    const store: AnalyticsStore = { recordToolEvent: vi.fn(), recordQuestionEvent };
    vi.mocked(getAnalyticsStoreModule.getAnalyticsStore).mockReturnValue(store);

    recordChatQuestionEvent("experience", 900, true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(recordQuestionEvent).toHaveBeenCalledWith({
      theme: "experience",
      latencyMs: 900,
      usedRetrieval: true,
    });
  });
});
