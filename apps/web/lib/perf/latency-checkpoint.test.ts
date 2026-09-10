import { describe, expect, it, vi } from "vitest";
import {
  formatLatencyCheckpoint,
  type LatencyCheckpointContext,
  timeToFirstStreamEventWithCheckpoints,
} from "./latency-checkpoint";

/**
 * Offline regression coverage for the latency spec's per-call instrumentation
 * (#307, issuecomment-5625009505 / 5624848753): the only fix authorized here
 * is closing the instrumentation gap where a hard `test.setTimeout` abort
 * left zero per-call evidence, without touching thresholds, warmup/sample
 * counts, the drain, or provider call count. Everything below runs against a
 * fake `fetch`/`ReadableStreamDefaultReader` — no live network or provider
 * call.
 */

function context(overrides: Partial<LatencyCheckpointContext> = {}): LatencyCheckpointContext {
  return { label: "chat", phase: "sample", index: 0, retry: 0, ...overrides };
}

function fakeReader(overrides: Partial<ReadableStreamDefaultReader<Uint8Array>> = {}) {
  return {
    read: vi.fn().mockResolvedValue({ done: false, value: new Uint8Array() }),
    cancel: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ReadableStreamDefaultReader<Uint8Array>;
}

function fakeResponse(reader: ReadableStreamDefaultReader<Uint8Array>, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: { getReader: () => reader },
  } as unknown as Response;
}

describe("formatLatencyCheckpoint", () => {
  it("includes only label/phase/index/retry/stage/elapsedMs and never a body/header/session field", () => {
    const line = formatLatencyCheckpoint(
      context({ index: 2, retry: 1 }),
      "response-received",
      123.456,
      {
        status: 200,
      },
    );
    expect(line).toContain("label=chat");
    expect(line).toContain("phase=sample");
    expect(line).toContain("index=2");
    expect(line).toContain("retry=1");
    expect(line).toContain("stage=response-received");
    expect(line).toContain("elapsedMs=123.5");
    expect(line).toContain("status=200");
    for (const forbidden of ["body", "header", "session", "authorization", "cookie", "secret"]) {
      expect(line.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("omits the status field entirely when no detail is given", () => {
    const line = formatLatencyCheckpoint(context(), "call-start", 0);
    expect(line).not.toContain("status=");
  });
});

describe("timeToFirstStreamEventWithCheckpoints", () => {
  it("logs call-start, response-received, and first-read in order on a normal completion", async () => {
    const reader = fakeReader();
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(reader));
    const log = vi.fn();
    const now = vi.fn().mockReturnValueOnce(0).mockReturnValue(50);

    const elapsedMs = await timeToFirstStreamEventWithCheckpoints({
      url: "https://example.test/api/chat",
      requestInit: { method: "POST" },
      context: context(),
      fetchImpl,
      now,
      log,
    });

    expect(elapsedMs).toBe(50);
    const stages = log.mock.calls.map((call) => call[1]);
    expect(stages).toEqual([
      "call-start",
      "response-received",
      "first-read",
      "cancel-start",
      "cancel-complete",
    ]);
    expect(reader.cancel).toHaveBeenCalledOnce();
  });

  it("preserves earlier completed calls' checkpoints when a later call's fetch hangs", async () => {
    const log = vi.fn();
    const firstReader = fakeReader();
    const firstFetch = vi.fn().mockResolvedValue(fakeResponse(firstReader));

    await timeToFirstStreamEventWithCheckpoints({
      url: "https://example.test/api/chat",
      requestInit: { method: "POST" },
      context: context({ index: 0 }),
      fetchImpl: firstFetch,
      log,
    });
    const evidenceAfterFirstCall = [...log.mock.calls];
    expect(evidenceAfterFirstCall.length).toBeGreaterThan(0);

    // Second call's fetch never resolves — simulates the hang a hard
    // test.setTimeout aborts mid-await.
    const hangingFetch = vi.fn().mockReturnValue(new Promise<Response>(() => undefined));
    const pendingCall = timeToFirstStreamEventWithCheckpoints({
      url: "https://example.test/api/chat",
      requestInit: { method: "POST" },
      context: context({ index: 1 }),
      fetchImpl: hangingFetch,
      log,
    });
    // Let the pending call's synchronous call-start checkpoint flush.
    await Promise.resolve();
    await Promise.resolve();

    // Earlier evidence must still be present, unmodified, plus the hanging
    // call's own call-start — proving partial evidence survives a later hang.
    expect(log.mock.calls.slice(0, evidenceAfterFirstCall.length)).toEqual(evidenceAfterFirstCall);
    const stagesSoFar = log.mock.calls.slice(evidenceAfterFirstCall.length).map((call) => call[1]);
    expect(stagesSoFar).toEqual(["call-start"]);

    void pendingCall.catch(() => undefined);
  });

  it("logs response-received before a hanging first read, but never first-read", async () => {
    const log = vi.fn();
    const hangingReader = fakeReader({
      read: vi.fn().mockReturnValue(new Promise(() => undefined)),
    });
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(hangingReader));

    const pendingCall = timeToFirstStreamEventWithCheckpoints({
      url: "https://example.test/api/chat",
      requestInit: { method: "POST" },
      context: context(),
      fetchImpl,
      log,
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const stages = log.mock.calls.map((call) => call[1]);
    expect(stages).toEqual(["call-start", "response-received"]);

    void pendingCall.catch(() => undefined);
  });

  it("logs cancel-start before a hanging cancel, but never cancel-complete", async () => {
    const log = vi.fn();
    const hangingReader = fakeReader({
      cancel: vi.fn().mockReturnValue(new Promise(() => undefined)),
    });
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(hangingReader));

    const pendingCall = timeToFirstStreamEventWithCheckpoints({
      url: "https://example.test/api/chat",
      requestInit: { method: "POST" },
      context: context(),
      fetchImpl,
      log,
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const stages = log.mock.calls.map((call) => call[1]);
    expect(stages).toEqual(["call-start", "response-received", "first-read", "cancel-start"]);

    void pendingCall.catch(() => undefined);
  });

  it("records a safe call-failure checkpoint (status only) and rejects when fetch rejects, without leaking the raw error", async () => {
    const log = vi.fn();
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new Error("network reset: Authorization: Bearer secret-token-xyz"));

    await expect(
      timeToFirstStreamEventWithCheckpoints({
        url: "https://example.test/api/chat",
        requestInit: { method: "POST" },
        context: context(),
        fetchImpl,
        log,
      }),
    ).rejects.toThrow();

    const stages = log.mock.calls.map((call) => call[1]);
    expect(stages).toEqual(["call-start", "call-failure"]);
    for (const call of log.mock.calls) {
      const detail = call[3];
      expect(JSON.stringify(detail ?? {})).not.toContain("secret-token-xyz");
    }
  });

  it("records a safe call-failure checkpoint with HTTP status only when the response is not ok", async () => {
    const log = vi.fn();
    const reader = fakeReader();
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(reader, 503));

    await expect(
      timeToFirstStreamEventWithCheckpoints({
        url: "https://example.test/api/chat",
        requestInit: { method: "POST" },
        context: context(),
        fetchImpl,
        log,
      }),
    ).rejects.toThrow();

    expect(log.mock.calls.map((call) => call[1])).toEqual(["call-start", "call-failure"]);
    const failureDetail = log.mock.calls[1]?.[3];
    expect(failureDetail).toEqual({ status: 503 });
  });

  it("records a safe call-failure checkpoint when the stream ends with no chunk", async () => {
    const log = vi.fn();
    const reader = fakeReader({
      read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
    });
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(reader));

    await expect(
      timeToFirstStreamEventWithCheckpoints({
        url: "https://example.test/api/chat",
        requestInit: { method: "POST" },
        context: context(),
        fetchImpl,
        log,
      }),
    ).rejects.toThrow(/at least one stream chunk/);

    expect(log.mock.calls.map((call) => call[1])).toEqual([
      "call-start",
      "response-received",
      "call-failure",
      "cancel-start",
      "cancel-complete",
    ]);
  });

  it("records a safe call-failure checkpoint when the response has no body", async () => {
    const log = vi.fn();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, body: null } as unknown as Response);

    await expect(
      timeToFirstStreamEventWithCheckpoints({
        url: "https://example.test/api/chat",
        requestInit: { method: "POST" },
        context: context(),
        fetchImpl,
        log,
      }),
    ).rejects.toThrow(/stream/);

    expect(log.mock.calls.map((call) => call[1])).toEqual([
      "call-start",
      "response-received",
      "call-failure",
    ]);
  });
});
