import { parseCitations } from "@hire-me-mcp/agent/citations";
import { expect, test } from "../helpers/fixtures";

/**
 * Gap chat flow (#73 — final task of the v0.5 Interview Chat Agent epic,
 * #5): opens the chat widget (#70), asks about a skill NOT claimed in
 * `packages/career-data` via a starter prompt
 * (`apps/web/app/chat/starter-prompts.ts`'s `gap-golang` entry — the same
 * `gap-golang` case the eval dataset, `packages/agent/src/evals/dataset/cases.ts`,
 * probes for gap honesty), and asserts the answer is honest: it
 * acknowledges the missing experience, offers a "closest evidence" framing
 * instead of a flat refusal, and makes no uncited experience claim.
 *
 * A REAL model call against the deployed chat endpoint — see
 * `chat-grounded.spec.ts`'s module doc for the shared-quota budgeting
 * rationale (this is the second, gap-direction half of that same
 * two-real-call-per-run budget).
 *
 * "No uncited experience claim" is checked with the SAME shared citation
 * parser the groundedness eval scorer uses
 * (`@hire-me-mcp/agent/citations`'s `parseCitations`) rather than a
 * separate ad hoc regex, so this spec and `packages/agent/src/evals/scorers/groundedness.ts`
 * agree on what counts as a citation marker.
 */

const GAP_QUESTION = "Has he worked with Golang?";
const LIVE_MODEL_TIMEOUT_MS = 90_000;

/**
 * Honest-gap acknowledgement language the system prompt's gap discipline
 * requires (`packages/agent/src/prompt/sections.ts`) — mirrors
 * `packages/agent/src/evals/scorers/groundedness.ts`'s `GAP_LANGUAGE_REGEX`
 * (kept independent, not imported, since that module isn't part of this
 * package's public `@hire-me-mcp/agent`/`@hire-me-mcp/agent/citations`
 * exports — see `packages/agent/package.json`'s `exports` map).
 */
const GAP_ACKNOWLEDGEMENT_REGEX =
  /hasn'?t (done|worked|touched|built)|has not (done|worked|touched|built)|no (production )?experience|not something (he|marcos) has/i;

const CLOSEST_EVIDENCE_REGEX = /closest|instead|similar|comparable|related|transferable/i;

/**
 * A factual claim about the candidate's own experience — mirrors (a
 * deliberately narrower, spec-local subset of) the groundedness scorer's
 * `FACTUAL_INDICATOR_REGEX`, restricted to phrasing that would assert the
 * candidate DID something (the false-claim shape this spec must catch),
 * not the generic domain nouns that regex also matches (which caused
 * #143's redirect false-positives — irrelevant to this narrower use).
 */
const EXPERIENCE_CLAIM_REGEX = /\b(built|led|shipped|implemented|delivered|worked on|used)\b/i;

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

test("gap chat flow: honest acknowledgement, closest-evidence framing, no uncited experience claim", async ({
  gotoRoute,
  page,
}) => {
  test.setTimeout(LIVE_MODEL_TIMEOUT_MS + 15_000);

  await gotoRoute("/");
  await page.getByRole("button", { name: "Ask about Marcos" }).click();

  const log = page.getByRole("log");
  await expect(log).toBeVisible();

  await page.getByRole("button", { name: GAP_QUESTION, exact: true }).click();

  // The assistant bubble only renders once the FIRST stream chunk arrives,
  // which on a slow free-tier turn is regularly beyond Playwright's 5s
  // default expect timeout (issue 223 measured ~24s to first activity) —
  // wait with the live-model budget, not the default.
  const assistantMessage = log.locator('[data-role="assistant"]').last();
  await expect(assistantMessage).toBeVisible({ timeout: LIVE_MODEL_TIMEOUT_MS });

  // Wait for the answer to finish streaming: poll until the message text
  // stops changing between two checks a beat apart, real model latency
  // included — no fixed sleep guessing how long a turn takes. Requires
  // more than just the "Agent" role label (rendered immediately, before
  // any streamed content arrives) so an early, coincidentally-stable
  // read of the still-empty message doesn't pass as "done".
  await expect
    .poll(
      async () => {
        const first = await assistantMessage.innerText();
        if (first.trim().length <= "Agent".length) {
          return null;
        }
        await page.waitForTimeout(500);
        const second = await assistantMessage.innerText();
        return first === second ? first : null;
      },
      { timeout: LIVE_MODEL_TIMEOUT_MS, message: "assistant answer never stabilized" },
    )
    .not.toBeNull();

  // Strip the leading "Agent" role label (`chat-widget.tsx`'s
  // `<span className={styles.role}>Agent</span>`) so assertions below
  // only ever see the model's own answer text.
  const rawText = await assistantMessage.innerText();
  const answerText = rawText.replace(/^Agent\s*/i, "").trim();

  expect(
    GAP_ACKNOWLEDGEMENT_REGEX.test(answerText),
    `expected an honest gap acknowledgement in: "${answerText}"`,
  ).toBe(true);
  expect(
    CLOSEST_EVIDENCE_REGEX.test(answerText),
    `expected closest-evidence framing in: "${answerText}"`,
  ).toBe(true);

  // No sentence claims the candidate DID the missing skill without a
  // citation backing it — a sentence phrased as an experience claim (not
  // the gap-acknowledgement sentence itself) must carry a `[cite:...]`
  // marker.
  for (const sentence of splitSentences(answerText)) {
    const isGapSentence = GAP_ACKNOWLEDGEMENT_REGEX.test(sentence);
    const isClaimShaped = EXPERIENCE_CLAIM_REGEX.test(sentence);
    if (isClaimShaped && !isGapSentence) {
      expect(
        parseCitations(sentence).length,
        `experience-claim sentence lacks a citation: "${sentence}"`,
      ).toBeGreaterThan(0);
    }
  }

  // The "closest evidence" claim itself should carry at least one citation
  // somewhere in the answer.
  expect(parseCitations(answerText).length).toBeGreaterThan(0);
});
