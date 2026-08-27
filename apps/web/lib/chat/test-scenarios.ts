/**
 * Deterministic, model-free `POST /api/chat` responses for the preview
 * gate suite (#264).
 *
 * ## Why this exists
 *
 * `preview-e2e` is a REQUIRED status check. Until #264 its chat specs
 * asserted the product's own rendering contract — `[cite:...]` markers
 * becoming resolving links, the honest error copy, the multi-turn
 * transport sanitizer (#222) — by making REAL `gemini-3.5-flash-lite`
 * calls against the preview deployment. That made a required gate depend
 * on a third party's free-tier daily allowance: once the Preview-scoped
 * Google project hit its 500 requests/day cap, `/api/chat` answered every
 * request with this app's own `{"code":"rate_limited"}` envelope and BOTH
 * chat specs failed on EVERY open PR regardless of content (#264's
 * evidence: #259, #262 and #263 failing identically on the same day).
 *
 * The rejected fix was to detect that condition and let the required check
 * pass anyway. That is a merge bypass: a PR that genuinely breaks the chat
 * produces failures that could be classified as "provider unavailable" and
 * merge. A required gate must never turn green because a third party
 * misbehaved.
 *
 * So the two concerns are split instead. The things that actually regress
 * in a PR are OUR code, and none of them need a real model — they need a
 * deterministic response. This module is that response: a fixed, scripted
 * UI-message stream carrying known citation markers of every citable
 * entity type, and a fixture that reproduces the exact `rate_limited`
 * error envelope. The required lane asserts against these; live-model
 * verification moved to a separate, non-required lane (see
 * `.github/workflows/ci.yml`'s `preview-chat-live` job).
 *
 * ## Why it cannot fire in production
 *
 * Three independent gates, checked in {@link resolveChatTestScenario},
 * every one of which must pass:
 *
 * 1. The request must carry the {@link CHAT_TEST_SCENARIO_HEADER} header
 *    naming a known scenario. Absent (every real visitor, always) → the
 *    handler is untouched and the real agent runs.
 * 2. `VERCEL_ENV` must not be `"production"`. On Vercel that variable is
 *    set by the platform, not by the request, so a Production deployment
 *    can never be talked into this path by any header combination.
 * 3. The request must carry {@link CHAT_TEST_SECRET_HEADER} whose value
 *    equals the deployment's `VERCEL_AUTOMATION_BYPASS_SECRET` — the
 *    credential the preview suite already holds (it is what gets past
 *    Vercel Deployment Protection, see `e2e-preview/helpers/bypass.ts`).
 *    No NEW secret is introduced, and a deployment without that variable
 *    set can never satisfy this gate at all. Compared with
 *    `timingSafeEqual`, not `===`.
 *
 * A request that names a scenario but fails gate 2 or 3 is **rejected**
 * (HTTP 400, `invalid_request`) rather than quietly falling through to the
 * real model. Failing closed is what makes "production refuses the flag"
 * cheaply assertable — `scripts/certify-production.mjs` checks exactly
 * that, and it costs zero model calls to check.
 *
 * A dedicated header name (rather than reading `x-vercel-protection-bypass`
 * directly) is deliberate: that header belongs to Vercel's own edge and
 * whether it survives to the function is Vercel's business, not a contract
 * this app should depend on. The VALUE is the same existing credential.
 */

import { timingSafeEqual } from "node:crypto";
import type { UIMessageChunk } from "ai";

/** Names the scripted scenario to serve. Absent on every real request. */
export const CHAT_TEST_SCENARIO_HEADER = "x-chat-test-scenario";

/** Carries `VERCEL_AUTOMATION_BYPASS_SECRET` — see the module doc for why the header name is ours. */
export const CHAT_TEST_SECRET_HEADER = "x-chat-test-secret";

/** The scripted turns the preview suite can ask for. */
export const CHAT_TEST_SCENARIOS = ["grounded-citations", "provider-rate-limited"] as const;

export type ChatTestScenario = (typeof CHAT_TEST_SCENARIOS)[number];

/**
 * A phrase no live model answer would ever produce, embedded in the
 * scripted answer. A spec asserting on it can never be satisfied by a real
 * model turn, so "the deterministic path silently stopped working and we
 * fell back to the live model" fails loudly instead of passing.
 */
export const CHAT_TEST_FIXTURE_SENTINEL = "deterministic-chat-fixture";

/** The environment inputs the gate reads. Injected so the unit tests never mutate `process.env`. */
export interface ChatTestScenarioEnv {
  /** Vercel's own deployment-environment marker: `"production"` disables this module entirely. */
  vercelEnv: string | undefined;
  /** `VERCEL_AUTOMATION_BYPASS_SECRET` — the credential the preview suite already holds. */
  automationSecret: string | undefined;
}

export type ChatTestScenarioResolution =
  /** No scenario header — the overwhelmingly common case; the real agent runs. */
  | { outcome: "absent" }
  /** A scenario was named but a gate refused it. The caller must fail the request, never fall through. */
  | { outcome: "rejected"; reason: string }
  | { outcome: "scripted"; scenario: ChatTestScenario };

function isChatTestScenario(value: string): value is ChatTestScenario {
  return (CHAT_TEST_SCENARIOS as readonly string[]).includes(value);
}

/** Constant-time string comparison that tolerates differing lengths (`timingSafeEqual` throws on those). */
function secretMatches(provided: string, expected: string): boolean {
  const providedBytes = Buffer.from(provided, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (providedBytes.length !== expectedBytes.length) {
    return false;
  }
  return timingSafeEqual(providedBytes, expectedBytes);
}

/** Reads the gate's environment inputs from `process.env`. */
export function readChatTestScenarioEnv(): ChatTestScenarioEnv {
  return {
    vercelEnv: process.env.VERCEL_ENV,
    automationSecret: process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
  };
}

/**
 * Decides whether this request may be served a scripted stream. See the
 * module doc for the three gates and why a named-but-unauthorized scenario
 * is rejected rather than ignored.
 */
export function resolveChatTestScenario(
  headers: Headers,
  env: ChatTestScenarioEnv,
): ChatTestScenarioResolution {
  const requested = headers.get(CHAT_TEST_SCENARIO_HEADER);
  if (requested === null || requested.length === 0) {
    return { outcome: "absent" };
  }

  if (env.vercelEnv === "production") {
    return { outcome: "rejected", reason: "scripted chat scenarios are disabled in production" };
  }

  const expectedSecret = env.automationSecret;
  if (expectedSecret === undefined || expectedSecret.length === 0) {
    return {
      outcome: "rejected",
      reason: "this deployment has no automation secret configured",
    };
  }

  const providedSecret = headers.get(CHAT_TEST_SECRET_HEADER);
  if (providedSecret === null || !secretMatches(providedSecret, expectedSecret)) {
    return { outcome: "rejected", reason: "missing or invalid automation secret" };
  }

  if (!isChatTestScenario(requested)) {
    return { outcome: "rejected", reason: `unknown scripted chat scenario "${requested}"` };
  }

  return { outcome: "scripted", scenario: requested };
}

/**
 * The real career-data ids the scripted answer cites, one per citable
 * entity type. Supplied by `test-scenario-fixture.ts` from the deployed
 * dataset so every marker points at content that actually exists — a
 * citation link in the fixture resolves to a real page and a real
 * fragment, exactly as a live answer's would.
 */
export interface ChatTestCitationIds {
  experience: string;
  project: string;
  skill: string;
  gap: string;
  writing: string;
  profile: string;
  education: string;
  recommendation: string;
}

/**
 * The scripted answer text.
 *
 * Marker placement is load-bearing, not decorative:
 *
 * - `experience`/`project`/`skill`/`gap`/`writing` are the five types
 *   `app/chat/resolve-chat-citation-href.ts` can map to a site section, so
 *   each must render as a link whose href resolves to a real page (and, for
 *   the anchored ones, a real fragment).
 * - `profile`/`education`/`recommendation` are the three types #227 taught
 *   the resolver, which it used to drop mid-sentence — so each must render
 *   as a link too, never as a raw `[cite:...]` string.
 * - One marker's entity type is a TOOL NAME (`get-skill-evidence`), which is
 *   what the live model actually wrote in issue 270. It is not a citable
 *   entity, so it must leave the prose entirely (as a hidden
 *   `data-unresolved-citation` trace) rather than reaching a reader as raw
 *   machine syntax.
 * - Two markers sit with a space between them and the sentence's own `.`
 *   and `,`, which is issue 277's `costs ¹ . He` artifact: the rendered
 *   reference must splice in place and close that gap.
 * - The last paragraph is a Markdown list with bold, emphasis and inline
 *   code — issue 272, where the career walkthrough printed its own `*` and
 *   `**` to the reader.
 */
export function scriptedAnswerText(ids: ChatTestCitationIds): string {
  return [
    `Marcos rebuilt the platform described in [cite:experience:${ids.experience}], `,
    `shipped [cite:project:${ids.project}], and works in [cite:skill:${ids.skill}] daily. `,
    `He has not worked with [cite:gap:${ids.gap}]; the closest evidence is his writing `,
    `[cite:writing:${ids.writing}]. Citation types this site cannot link to are dropped from `,
    `the prose entirely — profile [cite:profile:${ids.profile}] education `,
    `[cite:education:${ids.education}] recommendation [cite:recommendation:${ids.recommendation}] `,
    `— and this sentence still reads cleanly (${CHAT_TEST_FIXTURE_SENTINEL}).\n`,
    // Issue 270: the entity-type slot holds a TOOL's name, exactly as the
    // live model wrote it. Not a citation; must never be read as prose.
    `A marker naming a tool is not a citation [cite:get-skill-evidence:${ids.gap}]; it is `,
    `machine syntax and the reader never sees it.\n`,
    // Issue 277: the model spaced these markers away from the punctuation.
    `A reference splices in place [cite:skill:${ids.skill}] . And before a comma too `,
    `[cite:project:${ids.project}] , like so.\n\n`,
    // Issue 272: the shape every "walk me through his roles" answer takes.
    `Roles:\n`,
    `* **A bolded company** — a bullet the widget renders as a list item `,
    `[cite:experience:${ids.experience}].\n`,
    `* **A second company** — with *emphasis* and \`inline code\`.`,
  ].join("");
}

/** Splits the scripted answer into stream deltas, so the client exercises its real incremental-render path. */
function textDeltas(text: string): string[] {
  return text.match(/[\s\S]{1,40}/g) ?? [text];
}

/**
 * The chunk sequence for a scenario, in wire order.
 *
 * `grounded-citations` deliberately includes a completed `dynamic-tool`
 * step before its text. Two reasons: it is what makes the widget's
 * "Consulting career data…" step indicator reachable without a model, and
 * — more importantly — it puts tool parts into the assistant turn the
 * client then REPLAYS on the next message. That replay is exactly what
 * #222 regressed on (`step-start`/`tool-*` parts sent verbatim were
 * rejected with HTTP 400 `invalid_request`), so a second scripted turn is
 * a genuine regression test for `app/chat/to-request-messages.ts` — with
 * zero model calls.
 *
 * `provider-rate-limited` reproduces byte-for-byte the envelope #264
 * observed in the wild: the flat `{ code, message }` shape
 * `lib/chat/stream-errors.ts` writes into an `error` part.
 */
export function scriptedChatChunks(
  scenario: ChatTestScenario,
  ids: ChatTestCitationIds,
): UIMessageChunk[] {
  if (scenario === "provider-rate-limited") {
    return [
      { type: "start" },
      { type: "start-step" },
      {
        type: "error",
        errorText: JSON.stringify({
          code: "rate_limited",
          message:
            "The model provider is rate-limiting requests right now. Please try again shortly.",
        }),
      },
      { type: "finish-step" },
      { type: "finish" },
    ];
  }

  const toolCallId = "deterministic-tool-call";
  const textId = "deterministic-text";
  return [
    { type: "start" },
    { type: "start-step" },
    {
      type: "tool-input-available",
      toolCallId,
      toolName: "search-career",
      input: { query: "scripted preview-gate fixture" },
      dynamic: true,
    },
    {
      type: "tool-output-available",
      toolCallId,
      output: { results: [] },
      dynamic: true,
    },
    { type: "text-start", id: textId },
    ...textDeltas(scriptedAnswerText(ids)).map(
      (delta): UIMessageChunk => ({ type: "text-delta", id: textId, delta }),
    ),
    { type: "text-end", id: textId },
    { type: "finish-step" },
    { type: "finish" },
  ];
}
