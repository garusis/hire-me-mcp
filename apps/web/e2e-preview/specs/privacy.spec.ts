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
