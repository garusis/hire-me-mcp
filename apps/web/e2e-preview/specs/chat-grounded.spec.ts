import { parseCitationMarker } from "@hire-me-mcp/agent/citations";
import {
  answerParagraph,
  CITATION_LINK_SELECTOR,
  CITATION_SOURCE_SELECTOR,
} from "../helpers/chat-answer";
import { expect, test } from "../helpers/fixtures";

/**
 * Grounded chat flow (#73 — final task of the v0.5 Interview Chat Agent
 * epic, #5): opens the chat widget (#70), asks a real career question via
 * a starter prompt (`apps/web/app/chat/starter-prompts.ts`'s
 * `grounded-house-numbers` entry — answerable from real
 * `packages/career-data` content), and asserts the streamed answer renders
 * with at least one citation reference whose target resolves to a real site
 * section, and that the same source is listed in the message's "Sources"
 * list.
 *
 * Issue 227 strengthened this: a citation now renders as a numbered
 * superscript carrying the marker on `data-citation`, so this spec checks
 * the marker parses, the href resolves to a real page AND fragment, the
 * reference is not the bare home-page fallback, the "Sources" list repeats
 * it, and — the actual reported defect — the answer prose contains no
 * leftover `" ."` where a marker used to be deleted.
 *
 * A REAL model call — no route stubbing — against the deployed chat
 * endpoint (`POST /api/chat`, #67), which runs the embedded interview
 * agent (`@hire-me-mcp/agent`) in-process. Costs one real
 * `gemini-3.5-flash-lite` free-tier call per run; see
 * `packages/agent/README.md`'s "Running evals in CI" section for the
 * shared-quota rationale this spec is deliberately budgeted against (one
 * grounded + one gap call per preview-e2e run, not a whole eval dataset).
 *
 * Waits on FINAL rendered state (the citation link actually appearing in
 * the DOM), not a fixed sleep — streamed text arrives incrementally via
 * `useChat`, so the assertion below polls Playwright's own auto-waiting
 * `expect(...).toBeVisible()` with a generous timeout instead of guessing
 * how long a real model turn takes.
 */

const GROUNDED_QUESTION = "What did Marcos build at House Numbers?";
const FOLLOW_UP_QUESTION = "Which technologies did he use there?";
const LIVE_MODEL_TIMEOUT_MS = 90_000;

// #264: a REAL model call, so this runs only in the non-required
// `preview-chat-live` lane — never in the required `preview-e2e` gate. See
// `playwright.preview.config.ts`'s LIVE_MODEL_TAG for why.
test("grounded chat flow: streamed answer renders with a citation link to a real site section, and a follow-up turn succeeds (#222)", {
  tag: "@live-model",
}, async ({ gotoRoute, page, request, baseURL }) => {
  // Two live model turns (the grounded question + the #222 follow-up
  // regression below), each up to LIVE_MODEL_TIMEOUT_MS.
  test.setTimeout(2 * LIVE_MODEL_TIMEOUT_MS + 15_000);

  await gotoRoute("/");
  await page.getByRole("button", { name: "Ask about Marcos" }).click();

  const log = page.getByRole("log");
  await expect(log).toBeVisible();

  await page.getByRole("button", { name: GROUNDED_QUESTION, exact: true }).click();

  // The assistant bubble only renders once the FIRST stream chunk arrives,
  // which on a slow free-tier turn is regularly beyond Playwright's 5s
  // default expect timeout (issue 223 measured ~24s to first activity) —
  // wait with the live-model budget, not the default.
  const assistantMessage = log.locator('[data-role="assistant"]').last();
  await expect(assistantMessage).toBeVisible({ timeout: LIVE_MODEL_TIMEOUT_MS });

  // A citation renders as a numbered superscript link carrying its marker on
  // `data-citation` (`apps/web/app/chat/citation-text.tsx`) — wait for at
  // least one to stream in, real model latency included.
  const citationLink = assistantMessage.locator(CITATION_LINK_SELECTOR);
  await expect(citationLink.first()).toBeVisible({ timeout: LIVE_MODEL_TIMEOUT_MS });

  const markerText = await citationLink.first().getAttribute("data-citation");
  expect(markerText, "citation reference must carry its marker on data-citation").toBeTruthy();
  expect(
    parseCitationMarker(markerText as string),
    `expected "${markerText}" to parse as a well-formed citation marker`,
  ).not.toBeNull();

  // Machine syntax must never reach the reader's sentence, and deleting a
  // marker must not leave the space in front of it behind — issue 227's two
  // visible symptoms, both asserted against the real streamed answer.
  const answerText = await answerParagraph(assistantMessage).innerText();
  expect(answerText).not.toContain("[cite:");
  expect(answerText, `stray citation gap in: "${answerText}"`).not.toMatch(/ [.,]/);

  // The same source is repeated in the message's own "Sources" list, which
  // is what makes the citation checkable rather than just clickable.
  const sourceEntry = assistantMessage.locator(CITATION_SOURCE_SELECTOR);
  await expect(sourceEntry.first()).toBeVisible({ timeout: LIVE_MODEL_TIMEOUT_MS });
  await expect(sourceEntry.first()).not.toHaveText("");

  const href = await citationLink.first().getAttribute("href");
  expect(href, "citation link must carry an href").toBeTruthy();
  expect(href).not.toBe("/");

  // #222 regression: the SECOND turn of a conversation must succeed. The
  // first assistant turn's replayed history carries `step-start`/`tool-*`
  // parts, which used to be sent verbatim and rejected with HTTP 400
  // `invalid_request` — making the chat effectively single-turn. Costs one
  // extra live model call per preview run, accepted for the flagship
  // interactive feature's core regression. Run BEFORE the citation-target
  // navigation below, which would discard the conversation state.
  const chatInput = page.getByLabel("Message");
  await expect(chatInput).toBeEnabled({ timeout: LIVE_MODEL_TIMEOUT_MS });
  await chatInput.fill(FOLLOW_UP_QUESTION);
  await page.getByRole("button", { name: "Send", exact: true }).click();

  const secondAssistantMessage = log.locator('[data-role="assistant"]').nth(1);
  await expect(secondAssistantMessage).toBeVisible({ timeout: LIVE_MODEL_TIMEOUT_MS });
  // Turn complete: the input re-enables only once the stream finishes.
  await expect(chatInput).toBeEnabled({ timeout: LIVE_MODEL_TIMEOUT_MS });
  // The answer paragraph must carry real text — the bubble alone would also
  // render for an errored/blank turn.
  await expect(answerParagraph(secondAssistantMessage)).not.toHaveText("");
  // Scoped to the chat panel: a page-level getByRole("alert") also matches
  // Next.js's own route announcer (an always-present, empty alert element),
  // which false-positived this assertion on an otherwise fully green turn.
  const chatPanel = page.getByRole("region", { name: "Chat with the interview agent" });
  await expect(chatPanel.getByRole("alert")).toHaveCount(0);

  // Resolve the href for real: the target page must actually load, and if
  // the href carries a fragment, that fragment's element must exist on the
  // rendered page — a citation pointing at a section that doesn't really
  // exist would be a broken, dishonest link.
  const [path, fragment] = (href as string).split("#");
  const response = await request.get(`${baseURL}${path || "/"}`);
  expect(response.ok(), `citation target ${path} did not load (status ${response.status()})`).toBe(
    true,
  );

  if (fragment) {
    await gotoRoute(path || "/");
    await expect(page.locator(`#${fragment}`)).toBeVisible();
  }
});

const LEADERSHIP_QUESTION = "Tell me about a time Marcos showed leadership";

/**
 * Behavioral-story chat flow (#296, epic 288). Not a starter prompt —
 * `app/chat/starter-prompts.ts` has no leadership entry — so this types the
 * natural question directly into the message input, exactly as a real
 * visitor would.
 *
 * The interview agent's `list-career-stories`/`search-career` tools can
 * cite more than one record for an open-ended question like this, so this
 * scans every citation link the turn renders rather than assuming the
 * FIRST is the story — the acceptance criterion is that a story citation
 * appears somewhere in the answer, not that it's the only or first one.
 * When it does, its href must resolve to its PRIMARY parent experience's
 * `/experience#<anchor>` — the exact parent anchor, never the bare
 * `/experience` fallback a resolver falls back to for an unmapped parent
 * (`resolveCitationHref`'s `story` case) — and never a `/stories` path,
 * since there is no public stories route on the site (#288, #293).
 */
test("leadership story flow: a natural leadership question renders a story citation whose href is its parent experience anchor, never a /stories path (#296)", {
  tag: "@live-model",
}, async ({ gotoRoute, page, request, baseURL }) => {
  test.setTimeout(LIVE_MODEL_TIMEOUT_MS + 15_000);

  await gotoRoute("/");
  await page.getByRole("button", { name: "Ask about Marcos" }).click();

  const log = page.getByRole("log");
  await expect(log).toBeVisible();

  const chatInput = page.getByLabel("Message");
  await chatInput.fill(LEADERSHIP_QUESTION);
  await page.getByRole("button", { name: "Send", exact: true }).click();

  const assistantMessage = log.locator('[data-role="assistant"]').last();
  await expect(assistantMessage).toBeVisible({ timeout: LIVE_MODEL_TIMEOUT_MS });

  const citationLinks = assistantMessage.locator(CITATION_LINK_SELECTOR);
  await expect(citationLinks.first()).toBeVisible({ timeout: LIVE_MODEL_TIMEOUT_MS });

  let storyHref: string | null = null;
  const citationCount = await citationLinks.count();
  for (let index = 0; index < citationCount; index++) {
    const link = citationLinks.nth(index);
    const markerText = await link.getAttribute("data-citation");
    const marker = markerText ? parseCitationMarker(markerText) : null;
    if (marker?.entityType === "story") {
      storyHref = await link.getAttribute("href");
      break;
    }
  }

  expect(
    storyHref,
    "expected the leadership answer to cite at least one behavioral story",
  ).not.toBeNull();
  expect(storyHref, "story citation must never link to a /stories path").not.toContain("/stories");

  const [path, fragment] = (storyHref as string).split("#");
  expect(path).toBe("/experience");
  expect(
    fragment,
    "story citation must resolve to its PARENT experience anchor, not the bare /experience fallback",
  ).toBeTruthy();

  // The parent anchor must actually exist on the rendered page — a
  // citation pointing at a section that doesn't really exist would be a
  // broken, dishonest link.
  const response = await request.get(`${baseURL}${path}`);
  expect(response.ok(), `citation target ${path} did not load (status ${response.status()})`).toBe(
    true,
  );
  await gotoRoute("/experience");
  await expect(page.locator(`#${fragment}`)).toBeVisible();
});
