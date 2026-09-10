/**
 * Per-call latency checkpoint instrumentation (#307,
 * issuecomment-5625009505 / 5624848753) for the chat warmup+sample loop in
 * `apps/web/e2e-preview/specs/latency.spec.ts`.
 *
 * The gap this closes: that spec's only `console.log` of a sample array ran
 * strictly after the full warmup+sample loop finished, so a hard
 * `test.setTimeout` abort mid-loop left zero evidence for which stage a
 * hung call was in. This module emits one safe checkpoint line *as each
 * stage happens* — call-start, response headers (HTTP status only), first
 * read completion, cancellation start/completion, and call failure — so
 * earlier completed calls' evidence survives a later call's hang, and the
 * pending stage of a hanging call is visible from its own last checkpoint.
 *
 * Each checkpoint is logged *before* the `await` that could hang on the
 * next stage (checkpoint-before-await), not after: `response-received` logs
 * before `reader.read()` is awaited, and `cancel-start` logs before
 * `reader.cancel()` is awaited. That is what makes a hung stage visible —
 * the last logged checkpoint names it.
 *
 * Deliberately narrow, whitelist-only detail: the only dynamic values a
 * checkpoint can ever carry are label/phase/index/retry/stage/elapsedMs and
 * an HTTP status code. Never a response body, response header, session id,
 * or raw error message/stack — this module has no code path that reads or
 * forwards any of those into a log line, so a call-failure checkpoint can't
 * accidentally leak a secret. This also means it never claims a provider
 * root cause (timeout vs. rate limit vs. cold start) from stream timing
 * alone — it records what stage was reached and how long it took, nothing
 * more.
 */

export type LatencyCheckpointPhase = "warmup" | "sample";

export type LatencyCheckpointStage =
  | "call-start"
  | "response-received"
  | "first-read"
  | "cancel-start"
  | "cancel-complete"
  | "call-failure";

export interface LatencyCheckpointContext {
  readonly label: string;
  readonly phase: LatencyCheckpointPhase;
  readonly index: number;
  readonly retry: number;
}

export interface LatencyCheckpointDetail {
  readonly status?: number;
}

export type LatencyCheckpointLogger = (
  context: LatencyCheckpointContext,
  stage: LatencyCheckpointStage,
  elapsedMs: number,
  detail?: LatencyCheckpointDetail,
) => void;

export function formatLatencyCheckpoint(
  context: LatencyCheckpointContext,
  stage: LatencyCheckpointStage,
  elapsedMs: number,
  detail?: LatencyCheckpointDetail,
): string {
  const parts = [
    "[latency-checkpoint]",
    `label=${context.label}`,
    `phase=${context.phase}`,
    `index=${context.index}`,
    `retry=${context.retry}`,
    `stage=${stage}`,
    `elapsedMs=${elapsedMs.toFixed(1)}`,
  ];
  if (detail?.status !== undefined) {
    parts.push(`status=${detail.status}`);
  }
  return parts.join(" ");
}

export const logLatencyCheckpoint: LatencyCheckpointLogger = (
  context,
  stage,
  elapsedMs,
  detail,
) => {
  // Deliberate: same readable-CI-output rationale as the spec's own
  // aggregate console.log — the `github` reporter surfaces test stdout.
  console.log(formatLatencyCheckpoint(context, stage, elapsedMs, detail));
};

export interface TimeToFirstStreamEventInit {
  readonly url: string;
  readonly requestInit: RequestInit;
  readonly context: LatencyCheckpointContext;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
  readonly log?: LatencyCheckpointLogger;
}

/**
 * Fetches `url`, times the first stream chunk, and cancels the reader —
 * the same behavior `latency.spec.ts`'s chat test previously inlined —
 * while emitting a checkpoint at every stage boundary. Throws (rather than
 * using Playwright's `expect`) so it stays runnable and unit-testable
 * outside a Playwright test context; the spec still fails the same way
 * when this rejects.
 */
export async function timeToFirstStreamEventWithCheckpoints(
  init: TimeToFirstStreamEventInit,
): Promise<number> {
  const fetchImpl = init.fetchImpl ?? fetch;
  const now = init.now ?? (() => performance.now());
  const log = init.log ?? logLatencyCheckpoint;
  const { context } = init;
  const startedAt = now();

  log(context, "call-start", 0);

  let response: Response;
  try {
    response = await fetchImpl(init.url, init.requestInit);
  } catch {
    log(context, "call-failure", now() - startedAt);
    throw new Error("chat request must succeed");
  }

  if (!response.ok) {
    log(context, "call-failure", now() - startedAt, { status: response.status });
    throw new Error("chat request must succeed");
  }

  log(context, "response-received", now() - startedAt, { status: response.status });

  if (!response.body) {
    log(context, "call-failure", now() - startedAt, { status: response.status });
    throw new Error("chat response must be a stream");
  }

  const reader = response.body.getReader();
  try {
    let done: boolean;
    try {
      ({ done } = await reader.read());
    } catch {
      log(context, "call-failure", now() - startedAt, { status: response.status });
      throw new Error("chat stream read failed");
    }

    const elapsedMs = now() - startedAt;
    if (done) {
      log(context, "call-failure", elapsedMs, { status: response.status });
      throw new Error("expected at least one stream chunk before the body closed");
    }

    log(context, "first-read", elapsedMs);
    return elapsedMs;
  } finally {
    log(context, "cancel-start", now() - startedAt);
    await reader.cancel().catch(() => undefined);
    log(context, "cancel-complete", now() - startedAt);
  }
}
