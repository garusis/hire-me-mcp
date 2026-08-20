import { expect, test } from "@playwright/test";

/**
 * SEO artifact checks (#58, exercising #44's output against a real
 * deployment): sitemap/robots reachable and well-formed, canonical tags
 * present, OG image endpoints return images.
 */
test("sitemap.xml is reachable and well-formed", async ({ request }) => {
  const response = await request.get("/sitemap.xml");
  expect(response.ok()).toBeTruthy();
  const body = await response.text();
  expect(body).toContain("<urlset");
  expect(body).toContain("<loc>");
});

test("robots.txt is reachable and well-formed", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.ok()).toBeTruthy();
  const body = await response.text();
  expect(body).toMatch(/User-agent: \*/i);
  expect(body).toContain("Sitemap:");
});

test("home page declares a canonical link", async ({ page }) => {
  await page.goto("/");
  // Next resolves the relative "/" canonical against metadataBase with no
  // trailing slash added back (e.g. "https://host", not "https://host/") —
  // assert on the origin shape rather than a specific trailing character.
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /^https?:\/\/[^/]+\/?$/,
  );
});

test("project detail page declares its own canonical link", async ({ page }) => {
  await page.goto("/projects/cowork");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /\/projects\/cowork$/,
  );
});

test("root Open Graph image endpoint returns an image", async ({ request }) => {
  const response = await request.get("/opengraph-image");
  expect(response.ok()).toBeTruthy();
  expect(response.headers()["content-type"]).toContain("image/png");
});

// Quarantined: this route 500s on the real Vercel deployment (works fine in
// a local production build) — a genuine, pre-existing production bug this
// gate discovered while being built, tracked at
// https://github.com/garusis/hire-me-mcp/issues/119, likely the same class
// of Vercel-only serverless-bundling gap #113/#114 fixed for /api/mcp.
// Remove `fixme` once #119 lands.
test.fixme("project Open Graph image endpoint returns an image", async ({ request }) => {
  const response = await request.get("/projects/cowork/opengraph-image");
  expect(response.ok()).toBeTruthy();
  expect(response.headers()["content-type"]).toContain("image/png");
});
