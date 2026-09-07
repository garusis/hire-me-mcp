import { describe, expect, it, vi } from "vitest";
import { createPacedEmbedder, InvalidPacingOptionsError } from "./pacing.js";

function fakeInner(callLog: string[][] = []) {
  return {
    callLog,
    async embed(texts: readonly string[]): Promise<number[][]> {
      callLog.push([...texts]);
      return texts.map((t) => [t.length]);
    },
  };
}

function clock(startAt = 0) {
  let time = startAt;
  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe("createPacedEmbedder", () => {
  it("preserves order across batches", async () => {
    const inner = fakeInner();
    const paced = createPacedEmbedder(inner, {
      maxTextsPerMinute: 80,
      batchSize: 2,
      now: () => 0,
      sleep: async () => {},
    });

    const texts = ["a", "bb", "ccc", "dddd", "eeeee"];
    const result = await paced.embed(texts);

    expect(result).toEqual(texts.map((t) => [t.length]));
  });

  it("makes no inner call for an empty input", async () => {
    const inner = fakeInner();
    const paced = createPacedEmbedder(inner, { maxTextsPerMinute: 80 });

    const result = await paced.embed([]);

    expect(result).toEqual([]);
    expect(inner.callLog).toHaveLength(0);
  });

  it("never sleeps while comfortably under the per-minute limit", async () => {
    const inner = fakeInner();
    const sleep = vi.fn(async () => {});
    const c = clock();
    const paced = createPacedEmbedder(inner, {
      maxTextsPerMinute: 80,
      batchSize: 16,
      now: c.now,
      sleep,
    });

    // 32 texts = 2 batches of 16, well under 80/min.
    await paced.embed(Array.from({ length: 32 }, (_, i) => `t${i}`));

    expect(sleep).not.toHaveBeenCalled();
    expect(inner.callLog).toHaveLength(2);
  });

  it("sleeps the exact time needed when the window is full", async () => {
    const inner = fakeInner();
    const c = clock(0);
    const sleepCalls: number[] = [];
    const sleep = async (ms: number) => {
      sleepCalls.push(ms);
      c.advance(ms);
    };
    const paced = createPacedEmbedder(inner, {
      maxTextsPerMinute: 20,
      batchSize: 10,
      now: c.now,
      sleep,
    });

    // First batch of 10 at t=0 fills half the window. Second batch of 10
    // fits exactly (10 + 10 = 20 <= 20), so it should NOT need to sleep.
    // A third batch of 10 would push the window to 30 > 20, so it must
    // wait until the first batch's 10 age out of the 60s window.
    await paced.embed(Array.from({ length: 30 }, (_, i) => `t${i}`));

    expect(inner.callLog).toHaveLength(3);
    // Exactly one sleep, waiting for the first batch (sent at t=0) to exit
    // the 60s window before the third batch (10+10+10=30 > 20) can proceed.
    expect(sleepCalls).toHaveLength(1);
    expect(sleepCalls[0]).toBe(60_000);
  });

  it("a burst of 188 texts at 80/min with batchSize 16 yields the expected sleep schedule", async () => {
    const inner = fakeInner();
    const c = clock(0);
    const sleepCalls: number[] = [];
    const sleep = async (ms: number) => {
      sleepCalls.push(ms);
      c.advance(ms);
    };
    const paced = createPacedEmbedder(inner, {
      maxTextsPerMinute: 80,
      batchSize: 16,
      now: c.now,
      sleep,
    });

    const texts = Array.from({ length: 188 }, (_, i) => `t${i}`);
    const result = await paced.embed(texts);

    expect(result).toHaveLength(188);
    // 188 / 16 = 11.75 -> 12 batches. Because the fake clock only moves
    // when `sleep` is called, every batch sent between two sleeps lands on
    // the exact same timestamp, so a whole group ages out of the 60s
    // window at once: 5 batches (5*16=80) fit for free, then group 2
    // (batches 6-10, another 5) needs one sleep to clear group 1's
    // timestamp, and group 3 (batches 11-12, the remaining 2, including
    // the last size-12 batch) needs one more sleep to clear group 2's.
    expect(inner.callLog).toHaveLength(12);
    expect(sleepCalls).toHaveLength(2);
    expect(sleepCalls[0]).toBe(60_000);
    expect(sleepCalls[1]).toBe(60_000);
  });

  it("reports progress via onBatch after each batch", async () => {
    const inner = fakeInner();
    const onBatch = vi.fn();
    const paced = createPacedEmbedder(inner, {
      maxTextsPerMinute: 80,
      batchSize: 16,
      now: () => 0,
      sleep: async () => {},
      onBatch,
    });

    await paced.embed(Array.from({ length: 32 }, (_, i) => `t${i}`));

    expect(onBatch).toHaveBeenCalledTimes(2);
    expect(onBatch).toHaveBeenNthCalledWith(1, { embedded: 16, total: 32 });
    expect(onBatch).toHaveBeenNthCalledWith(2, { embedded: 32, total: 32 });
  });

  it("clamps the effective batch size down to maxTextsPerMinute when it's below batchSize", async () => {
    const inner = fakeInner();
    const c = clock(0);
    const sleep = async (ms: number) => c.advance(ms);
    const paced = createPacedEmbedder(inner, {
      maxTextsPerMinute: 10,
      batchSize: 16,
      now: c.now,
      sleep,
    });

    const result = await paced.embed(Array.from({ length: 25 }, (_, i) => `t${i}`));

    expect(result).toHaveLength(25);
    // Effective batch size is min(16, 10) = 10, so 25 texts split 10/10/5
    // — each batch needs the previous one's window entry to fully age out
    // (10 + 10 > 10) before it can send, which the advancing fake clock
    // lets happen without an actual wait.
    expect(inner.callLog.map((batch) => batch.length)).toEqual([10, 10, 5]);
  });

  it("throws InvalidPacingOptionsError when maxTextsPerMinute is zero or negative", () => {
    const inner = fakeInner();

    expect(() => createPacedEmbedder(inner, { maxTextsPerMinute: 0 })).toThrow(
      InvalidPacingOptionsError,
    );
    expect(() => createPacedEmbedder(inner, { maxTextsPerMinute: -5 })).toThrow(
      InvalidPacingOptionsError,
    );
  });

  it("throws InvalidPacingOptionsError when batchSize is zero or negative", () => {
    const inner = fakeInner();

    expect(() => createPacedEmbedder(inner, { maxTextsPerMinute: 80, batchSize: 0 })).toThrow(
      InvalidPacingOptionsError,
    );
    expect(() => createPacedEmbedder(inner, { maxTextsPerMinute: 80, batchSize: -3 })).toThrow(
      InvalidPacingOptionsError,
    );
  });

  it("throws when the inner embedder returns a different number of vectors than texts sent", async () => {
    const inner = {
      async embed(texts: readonly string[]): Promise<number[][]> {
        // Deliberately drop one vector to simulate a misbehaving inner embedder.
        return texts.slice(1).map((t) => [t.length]);
      },
    };
    const paced = createPacedEmbedder(inner, {
      maxTextsPerMinute: 80,
      batchSize: 16,
      now: () => 0,
      sleep: async () => {},
    });

    await expect(paced.embed(["a", "b", "c"])).rejects.toThrow(/vectors/i);
  });

  it("shortens the needed sleep when the clock itself advances during an inner embed call", async () => {
    // maxTextsPerMinute=20, batchSize=10, 3 batches of 10. Batch 2's inner
    // call is slow enough (59s) to eat almost the whole window on its own
    // — window entries are timestamped at completion (see pacing.ts), so
    // only that much of the 60s wait is still owed by the time batch 3
    // asks for capacity, not a full fresh 60s.
    const c = clock(0);
    let embedCalls = 0;
    const inner = {
      async embed(texts: readonly string[]): Promise<number[][]> {
        embedCalls += 1;
        if (embedCalls === 2) c.advance(59_000);
        return texts.map((t) => [t.length]);
      },
    };
    const sleepCalls: number[] = [];
    const sleep = async (ms: number) => {
      sleepCalls.push(ms);
      c.advance(ms);
    };
    const paced = createPacedEmbedder(inner, {
      maxTextsPerMinute: 20,
      batchSize: 10,
      now: c.now,
      sleep,
    });

    await paced.embed(Array.from({ length: 30 }, (_, i) => `t${i}`));

    expect(embedCalls).toBe(3);
    // Batch 1 (t=0) + batch 2 (t=59000) together fill the 20/min window.
    // Batch 3 only needs batch 1's entry to age out, and by t=59000 that's
    // only 1000ms away — not the full 60000ms a fresh wait would take.
    expect(sleepCalls).toEqual([1_000]);
  });
});
