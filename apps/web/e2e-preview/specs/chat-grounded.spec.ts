import { parseCitations } from "@hire-me-mcp/agent/citations";
import { expect, test } from "../helpers/fixtures";

/**
 * Grounded chat flow (#73 — final task of the v0.5 Interview Chat Agent
 * epic, #5): opens the chat widget (#70), asks a real career question via
 * a starter prompt (`apps/web/app/chat/starter-prompts.ts`'s
 * `grounded-house-numbers` entry — answerable from real
 * `packages/career-data` content), and asserts the streamed answer renders
 * with at least one `[cite:...]` citation link whose target resolves to a
 * real site section.
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

test("grounded chat flow: streamed answer renders with a citation link to a real site section, and a follow-up turn succeeds (#222)", async ({
  gotoRoute,
  page,
  request,
  baseURL,
}) => {
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

  // A citation renders as a literal "[cite:entityType:entityId]" link
  // (`apps/web/app/chat/citation-text.tsx`) — wait for at least one to
  // stream in, real model latency included.
  const citationLink = assistantMessage.locator("a", { hasText: /^\[cite:/ });
  await expect(citationLink.first()).toBeVisible({ timeout: LIVE_MODEL_TIMEOUT_MS });

  const linkText = await citationLink.first().innerText();
  const [marker] = parseCitations(linkText);
  expect(marker, `expected "${linkText}" to parse as a well-formed citation marker`).toBeDefined();

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
  // The answer paragraph (the bubble's last <p>) must carry real text —
  // the bubble alone would also render for an errored/blank turn.
  await expect(secondAssistantMessage.locator("p").last()).not.toHaveText("");
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
