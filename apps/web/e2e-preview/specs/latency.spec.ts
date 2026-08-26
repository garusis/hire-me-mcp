import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { percentile } from "../../lib/perf/percentile";
import { resolveBaseUrl } from "../helpers/base-url";
import { bypassHeaders } from "../helpers/bypass";

/**
 * Latency budget gate (#62): percentile-over-repeated-calls thresholds for
 * the MCP read tools and the chat endpoint, against a REAL deployed origin
 * (a Vercel preview in CI, or any `BASE_URL` locally) — same target every
 * other `apps/web/e2e-preview/specs/*.spec.ts` suite exercises. Runs inside
 * the `preview-e2e` CI job (already in the `gemini-free-tier` concurrency
 * group — see `.github/workflows/ci.yml`), not a separate job, so this
 * suite's chat calls are serialized against the other Gemini-calling specs
 * rather than racing them.
 *
 * Thresholds and sample sizes live in the committed `performance-budgets.json`
 * (repo root) — never inline here — so a deliberate budget change is a
 * reviewable, diffable commit to that one file. See `docs/performance-budgets.md`
 * for how to run this locally and how to change a budget.
 *
 * MCP read-tool latency is measured as one warm-up call (discarded, so a
 * cold Lambda invocation never pollutes the sample) followed by
 * `sampleCalls` timed calls per tool, each a raw JSON-RPC `tools/call`
 * POST timed client-side with `performance.now()` — deliberately not the
 * `@modelcontextprotocol/sdk` client (`mcp.spec.ts`'s approach): a
 * transport `connect()` handshake before the first call would otherwise
 * leak into that call's measured duration.
 *
 * Chat latency budgets time-to-first-STREAM-EVENT (the first byte of the
 * `POST /api/chat` response body), not full completion — free-tier
 * `gemini-3.5-flash-lite` first-token latency is volatile (#169), so this
 * is the metric with real, budgetable margin. `warmupCalls + sampleCalls`
 * is capped at `maxCallsPerCiRun` (checked below) to keep this spec's own
 * contribution to the shared 15 RPM Gemini quota bounded.
 */

const budgetsPath = fileURLToPath(new URL("../../../../performance-budgets.json", import.meta.url));
const budgets = JSON.parse(readFileSync(budgetsPath, "utf-8")) as {
  latency: {
    mcpTools: {
      endpoint: string;
      warmupCalls: number;
      sampleCalls: number;
      percentile: number;
      tools: Record<string, { thresholdMs: number }>;
    };
    chat: {
      endpoint: string;
      warmupCalls: number;
      sampleCalls: number;
      maxCallsPerCiRun: number;
      percentile: number;
      thresholdMs: number;
    };
  };
};

const baseUrl = resolveBaseUrl();
const mcpUrl = `${baseUrl}${budgets.latency.mcpTools.endpoint}`;
const chatUrl = `${baseUrl}${budgets.latency.chat.endpoint}`;

test.describe.configure({ timeout: 90_000 });

/**
 * Drain the deployed origin's per-IP rate window before sampling (#76).
 *
 * This spec runs strictly after every other preview spec (the
 * `chromium-latency` project's `dependencies` edge), but "after" is not
 * "unaffected": the preceding specs' own `/api/mcp` calls (mcp.spec.ts's
 * handshakes/tool calls/bounded burst, security-headers.spec.ts's MCP
 * sequence) land in the same per-IP sliding window (60 req / 60 s by
 * default) this spec's samples then draw from. The combined total sits
 * right at that budget — release-readiness dispatch run 32748181900 and a
 * preview-e2e run on PR #210 both saw the LAST sampled tool 429 on every
 * attempt (Playwright retries just re-enter the same exhausted window),
 * failing the gate on the suite's own leftovers rather than a real
 * regression. Waiting one full window (plus margin) guarantees the p75
 * samples are measured against a clean budget. Skipped for localhost
 * targets: a local production build runs the fail-open (or hermetic
 * test) limiter, so there is nothing to drain and no reason to slow
 * `BASE_URL=http://127.0.0.1:3100` runs down.
 */
const RATE_WINDOW_DRAIN_MS = 75_000;
const isLocalTarget = /^https?:\/\/(127\.0\.0\.1|localhost)([:/]|$)/.test(baseUrl);

test.beforeAll(async () => {
  if (isLocalTarget) {
    return;
  }
  // The drain alone exceeds the config's default 60 s hook timeout.
  test.setTimeout(RATE_WINDOW_DRAIN_MS + 30_000);
  await new Promise((resolve) => setTimeout(resolve, RATE_WINDOW_DRAIN_MS));
});

/** Arguments each budgeted MCP read tool needs to succeed — mirrors mcp.spec.ts's real calls. */
const TOOL_ARGUMENTS: Record<string, Record<string, unknown>> = {
  "get-profile": {},
  "get-experience": {},
  "search-projects": { query: "typescript" },
  "get-skill-evidence": { term: "typescript" },
};

async function timedToolCall(toolName: string): Promise<number> {
  const startedAt = performance.now();
  const response = await fetch(mcpUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...bypassHeaders(),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: toolName, arguments: TOOL_ARGUMENTS[toolName] ?? {} },
    }),
  });
  await response.text();
  const elapsedMs = performance.now() - startedAt;
  expect(response.ok, `${toolName}: expected a 2xx response`).toBe(true);
  return elapsedMs;
}

for (const [toolName, toolBudget] of Object.entries(budgets.latency.mcpTools.tools)) {
  test(`${toolName}: p${budgets.latency.mcpTools.percentile} latency stays within budget`, async () => {
    // Warm-up call(s), discarded — a cold Lambda invocation must not count
    // toward the percentile sample.
    for (let i = 0; i < budgets.latency.mcpTools.warmupCalls; i++) {
      await timedToolCall(toolName);
    }

    const samples: number[] = [];
    for (let i = 0; i < budgets.latency.mcpTools.sampleCalls; i++) {
      samples.push(await timedToolCall(toolName));
    }

    const measuredMs = percentile(samples, budgets.latency.mcpTools.percentile);
    // Deliberate: readable CI output for baseline capture (#62) — Playwright's
    // `github` reporter (playwright.preview.config.ts) surfaces test stdout.
    console.log(
      `[latency] ${toolName}: p${budgets.latency.mcpTools.percentile}=${measuredMs.toFixed(1)}ms ` +
        `(threshold ${toolBudget.thresholdMs}ms, samples=${JSON.stringify(samples.map((s) => Math.round(s)))})`,
    );

    expect(
      measuredMs,
      `${toolName} p${budgets.latency.mcpTools.percentile} latency (${measuredMs.toFixed(1)}ms) ` +
        `exceeded the ${toolBudget.thresholdMs}ms budget in performance-budgets.json`,
    ).toBeLessThanOrEqual(toolBudget.thresholdMs);
  });
}

// #264: six REAL model calls — the single largest consumer of the shared
// free-tier daily budget, and meaningless when the provider is capped (a
// rate-limit error streams back in milliseconds, which would score as a
// FASTER first event). Tagged so it runs only in the non-required
// `preview-chat-live` lane; see playwright.preview.config.ts's LIVE_MODEL_TAG.
test("chat: p75 time-to-first-stream-event stays within budget", {
  tag: "@live-model",
}, async () => {
  const chatBudget = budgets.latency.chat;
  const totalCalls = chatBudget.warmupCalls + chatBudget.sampleCalls;
  expect(
    totalCalls,
    "this spec's total chat calls must not exceed maxCallsPerCiRun (shared Gemini free-tier quota, #169)",
  ).toBeLessThanOrEqual(chatBudget.maxCallsPerCiRun);

  async function timeToFirstStreamEvent(): Promise<number> {
    const sessionId = crypto.randomUUID();
    const startedAt = performance.now();
    const response = await fetch(chatUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...bypassHeaders() },
      body: JSON.stringify({
        sessionId,
        messages: [
          {
            id: crypto.randomUUID(),
            role: "user",
            parts: [{ type: "text", text: "In one short sentence, what does Marcos do?" }],
          },
        ],
      }),
    });
    expect(response.ok, "chat request must succeed").toBe(true);
    expect(response.body, "chat response must be a stream").not.toBeNull();

    const reader = (response.body as ReadableStream<Uint8Array>).getReader();
    try {
      const { done } = await reader.read();
      const elapsedMs = performance.now() - startedAt;
      expect(done, "expected at least one stream chunk before the body closed").toBe(false);
      return elapsedMs;
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  }

  // Warm-up call(s), discarded.
  for (let i = 0; i < chatBudget.warmupCalls; i++) {
    await timeToFirstStreamEvent();
  }

  const samples: number[] = [];
  for (let i = 0; i < chatBudget.sampleCalls; i++) {
    samples.push(await timeToFirstStreamEvent());
  }

  const measuredMs = percentile(samples, chatBudget.percentile);
  // Deliberate: readable CI output for baseline capture (#62).
  console.log(
    `[latency] chat: p${chatBudget.percentile}=${measuredMs.toFixed(1)}ms ` +
      `(threshold ${chatBudget.thresholdMs}ms, samples=${JSON.stringify(samples.map((s) => Math.round(s)))})`,
  );

  expect(
    measuredMs,
    `chat p${chatBudget.percentile} time-to-first-stream-event (${measuredMs.toFixed(1)}ms) ` +
      `exceeded the ${chatBudget.thresholdMs}ms budget in performance-budgets.json`,
  ).toBeLessThanOrEqual(chatBudget.thresholdMs);
});
