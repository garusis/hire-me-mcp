#!/usr/bin/env node
/**
 * Asserts that a PRODUCTION deployment refuses the scripted-chat flag (#264).
 *
 * `apps/web/lib/chat/test-scenarios.ts` lets the preview gate ask
 * `POST /api/chat` for a fixed, model-free response, behind three gates —
 * one of which is `VERCEL_ENV !== "production"`, checked BEFORE the
 * automation secret is even compared. The unit tests pin that ordering
 * (`apps/web/lib/chat/test-scenarios.test.ts`) and the handler tests pin the
 * 400 (`apps/web/app/api/chat/handler.test.ts`); this script is the end-to-end
 * half: the real production origin, over the real network, must refuse.
 *
 * "Refuse" means two things, both checked:
 *
 *   1. HTTP 400 with the app's own `invalid_request` code — not a stream.
 *   2. The response body carries no trace of the fixture (its sentinel
 *      phrase), so even an unexpected 200 could not slip a scripted answer
 *      past this check.
 *
 * Costs zero model calls: the refusal happens before the agent is ever
 * constructed, which is the whole point of failing closed rather than
 * ignoring an unauthorized flag.
 *
 * Usage:
 *   node scripts/ci/assert-scripted-chat-refused.mjs                 # production
 *   BASE_URL=<origin> node scripts/ci/assert-scripted-chat-refused.mjs
 *
 * Run as a step of `pnpm certify:production`. Exits non-zero on failure.
 */

const PRODUCTION_URL = "https://hire-me-mcp-web.vercel.app";
const baseUrl = (process.env.BASE_URL ?? PRODUCTION_URL).replace(/\/$/, "");

/** Kept in sync with `apps/web/lib/chat/test-scenarios.ts` — this script is plain Node and cannot import the TS module. */
const SCENARIO_HEADER = "x-chat-test-scenario";
const SECRET_HEADER = "x-chat-test-secret";
const FIXTURE_SENTINEL = "deterministic-chat-fixture";

function fail(message) {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
}

const body = {
  sessionId: crypto.randomUUID(),
  messages: [
    {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text: "In one sentence, what does Marcos do?" }],
    },
  ],
};

// Both a bare flag and a flag carrying whatever automation secret this
// environment happens to hold: production must refuse either way, because
// the environment gate short-circuits before the secret is read.
const attempts = [
  { label: "scenario flag alone", headers: { [SCENARIO_HEADER]: "grounded-citations" } },
  {
    label: "scenario flag with an automation secret",
    headers: {
      [SCENARIO_HEADER]: "grounded-citations",
      [SECRET_HEADER]: process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "not-the-secret",
    },
  },
];

console.log(`[assert-scripted-chat-refused] target: ${baseUrl}`);

for (const attempt of attempts) {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", ...attempt.headers },
    body: JSON.stringify(body),
  });
  const text = await response.text();

  if (response.status !== 400) {
    fail(
      `${attempt.label}: expected HTTP 400, got ${response.status} — body: ${text.slice(0, 400)}`,
    );
  } else {
    let code;
    try {
      code = JSON.parse(text)?.error?.code;
    } catch {
      code = undefined;
    }
    if (code !== "invalid_request") {
      fail(`${attempt.label}: expected error code "invalid_request", got ${JSON.stringify(code)}`);
    } else {
      console.log(`✓ ${attempt.label}: refused with 400 invalid_request`);
    }
  }

  if (text.includes(FIXTURE_SENTINEL)) {
    fail(
      `${attempt.label}: the response contained the scripted fixture — production served a script`,
    );
  }
}

if (process.exitCode) {
  console.error(
    "\nThe scripted-chat path must be unreachable on a production deployment. " +
      "Check VERCEL_ENV on the target and apps/web/lib/chat/test-scenarios.ts.",
  );
} else {
  console.log("\n[assert-scripted-chat-refused] PASS — production refuses the scripted-chat flag.");
}
