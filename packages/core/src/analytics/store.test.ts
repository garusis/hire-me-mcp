import { describe, expect, it, vi } from "vitest";
import type { AnalyticsStore } from "./store.js";
import { recordQuestionEvent, recordToolEvent } from "./store.js";

const toolEvent = {
  surface: "mcp" as const,
  toolName: "get-profile",
  outcome: "success" as const,
  latencyMs: 10,
};

const questionEvent = {
  theme: "experience" as const,
  latencyMs: 20,
  usedRetrieval: false,
};

describe("recordToolEvent", () => {
  it("returns synchronously without awaiting the store write", () => {
    let resolveWrite: () => void = () => undefined;
    const store: AnalyticsStore = {
      recordToolEvent: () =>
        new Promise((resolve) => {
          resolveWrite = resolve;
        }),
      recordQuestionEvent: () => Promise.resolve(),
    };

    const returnValue = recordToolEvent(store, toolEvent);

    expect(returnValue).toBeUndefined();
    resolveWrite();
  });

  it("a store that throws synchronously does not throw out of recordToolEvent", () => {
    const store: AnalyticsStore = {
      recordToolEvent: () => {
        throw new Error("boom");
      },
      recordQuestionEvent: () => Promise.resolve(),
    };

    expect(() => recordToolEvent(store, toolEvent, () => undefined)).not.toThrow();
  });

  it("a store whose promise rejects reports the error via onError instead of an unhandled rejection", async () => {
    const store: AnalyticsStore = {
      recordToolEvent: () => Promise.reject(new Error("store is down")),
      recordQuestionEvent: () => Promise.resolve(),
    };
    const onError = vi.fn();

    recordToolEvent(store, toolEvent, onError);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });

  it("logs to console.error by default rather than throwing when no onError is given", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const store: AnalyticsStore = {
      recordToolEvent: () => Promise.reject(new Error("store is down")),
      recordQuestionEvent: () => Promise.resolve(),
    };

    recordToolEvent(store, toolEvent);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("recordQuestionEvent", () => {
  it("returns synchronously and reports a rejected store write via onError", async () => {
    const store: AnalyticsStore = {
      recordToolEvent: () => Promise.resolve(),
      recordQuestionEvent: () => Promise.reject(new Error("boom")),
    };
    const onError = vi.fn();

    const returnValue = recordQuestionEvent(store, questionEvent, onError);
    expect(returnValue).toBeUndefined();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
