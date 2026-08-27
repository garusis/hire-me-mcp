import { expect, test } from "../helpers/fixtures";

/**
 * Public privacy note + private stats route checks (#81): the footer link
 * resolves to a real `/privacy` page, `/privacy` is listed in the sitemap
 * (the private `/api/stats` route never is), and `/api/stats` is both
 * unreachable without the configured secret and marked `noindex` even when
 * it does respond — see `apps/web/app/api/stats/handler.ts`'s module doc
 * for the fail-closed 404 rationale.
 */

test("the footer privacy link resolves to a real /privacy page", async ({ gotoRoute, page }) => {
  await gotoRoute("/");
  const privacyLink = page.getByRole("contentinfo").getByRole("link", { name: /privacy/i });
  await expect(privacyLink).toHaveAttribute("href", "/privacy");

  await privacyLink.click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { level: 1, name: /privacy/i })).toBeVisible();
});

test("the privacy note states the retention window and third-party services", async ({
  gotoRoute,
  page,
}) => {
  await gotoRoute("/privacy");
  await expect(page.getByText(/90 days/i)).toBeVisible();
  await expect(page.getByText(/vercel/i).first()).toBeVisible();
});

/**
 * Issue 239: the note used to claim session identifiers were never
 * collected while `POST /api/chat` required one — a copy-vs-reality gap that
 * only showed up against a deployed environment. These two tests close it
 * from both ends against the *same* deployment: the page says a session
 * identifier is sent, and the live endpoint proves it by rejecting a body
 * without one. A request that fails schema validation never reaches the
 * agent, so this costs no model tokens.
 */
test("the privacy note discloses the chat session identifier the API requires", async ({
  gotoRoute,
  page,
}) => {
  await gotoRoute("/privacy");
  await expect(page.getByRole("heading", { name: /chat session identifier/i })).toBeVisible();
  await expect(page.getByText(/never written to this site's usage database/i)).toBeVisible();
  await expect(page.getByText("sessionId", { exact: true })).toBeVisible();
});

test("POST /api/chat really does require the sessionId the privacy note describes", async ({
  request,
  baseURL,
}) => {
  // No `sessionId` — rejected by `chatRequestSchema` (guardrail #2) before
  // the agent is ever constructed. The `request` fixture carries the
  // Deployment Protection bypass header via the config's `extraHTTPHeaders`.
  const response = await request.post(`${baseURL}/api/chat`, {
    data: {
      messages: [{ id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text: "hi" }] }],
    },
  });
  expect(response.status()).toBe(400);
  const payload = (await response.json()) as { error?: { code?: string; message?: string } };
  expect(payload.error?.code).toBe("invalid_request");
  expect(payload.error?.message).toContain("sessionId");
});

test("sitemap.xml lists /privacy but never the private stats route", async ({
  request,
  baseURL,
}) => {
  const response = await request.get(`${baseURL}/sitemap.xml`);
  const body = await response.text();
  expect(body).toContain("/privacy");
  expect(body).not.toContain("/api/stats");
});

test("/api/stats is unreachable without the configured secret (404, leaks nothing)", async ({
  request,
  baseURL,
}) => {
  const response = await request.get(`${baseURL}/api/stats`);
  expect(response.status()).toBe(404);
});

test("/api/stats is unreachable with a wrong token (still 404, not 401 — see handler.ts)", async ({
  request,
  baseURL,
}) => {
  const response = await request.get(`${baseURL}/api/stats?token=definitely-wrong`);
  expect(response.status()).toBe(404);
});
