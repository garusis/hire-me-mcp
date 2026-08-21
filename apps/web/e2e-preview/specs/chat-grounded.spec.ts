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
const LIVE_MODEL_TIMEOUT_MS = 90_000;

test("grounded chat flow: streamed answer renders with a citation link to a real site section", async ({
  gotoRoute,
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(LIVE_MODEL_TIMEOUT_MS + 15_000);

  await gotoRoute("/");
  await page.getByRole("button", { name: "Ask about Marcos" }).click();

  const log = page.getByRole("log");
  await expect(log).toBeVisible();

  await page.getByRole("button", { name: GROUNDED_QUESTION, exact: true }).click();

  const assistantMessage = log.locator('[data-role="assistant"]').last();
  await expect(assistantMessage).toBeVisible();

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
