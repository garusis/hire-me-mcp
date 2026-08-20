import { dataset, slugify } from "../helpers/dataset";
import { expect, test } from "../helpers/fixtures";
import { ROUTES } from "../helpers/routes";

/**
 * SEO artifact checks (#58): `sitemap.xml` and `robots.txt` are reachable
 * and well-formed, every route carries a canonical tag, and the OG image
 * endpoints (default + per-entity, #44) return real images.
 */

test("sitemap.xml is reachable and well-formed", async ({ request, baseURL }) => {
  const response = await request.get(`${baseURL}/sitemap.xml`);
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("xml");
  const body = await response.text();
  expect(body).toContain("<urlset");
  expect(body).toContain("<loc>");
});

test("robots.txt is reachable, well-formed, and points at the sitemap", async ({
  request,
  baseURL,
}) => {
  const response = await request.get(`${baseURL}/robots.txt`);
  expect(response.ok()).toBe(true);
  const body = await response.text();
  expect(body).toContain("User-Agent:");
  expect(body).toContain("Sitemap:");
  expect(body).toContain("/sitemap.xml");
});

for (const route of ROUTES) {
  test(`${route.name} carries a canonical tag`, async ({ gotoRoute, page }) => {
    await gotoRoute(route.path);
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveCount(1);
    const href = await canonical.getAttribute("href");
    expect(href, "canonical href must be an absolute URL").toMatch(/^https?:\/\//);
    expect(href).toContain(route.path === "/" ? "/" : route.path);
  });
}

test("the default Open Graph image endpoint returns an image", async ({ request, baseURL }) => {
  const response = await request.get(`${baseURL}/opengraph-image`);
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("image");
});

test("a project's Open Graph image endpoint returns an image", async ({ request, baseURL }) => {
  // Regression proof for #119: this route 500'd on Vercel production
  // (deployed Lambda) while passing against every local check — a
  // preview/production HTTP round-trip is the only signal that actually
  // exercises the real deployed environment, which is why it's asserted
  // here rather than only via the local build-trace guards in
  // apps/web/e2e/og-image-content-trace.smoke.spec.ts. Beyond `response.ok()`
  // (which alone would already have caught the 500), the body-size check
  // guards against a "200 but empty/broken image" regression that a bare
  // status/content-type check wouldn't catch.
  const [project] = dataset.projects;
  if (project === undefined) {
    test.skip(true, "no projects authored");
    return;
  }
  const response = await request.get(`${baseURL}/projects/${slugify(project.id)}/opengraph-image`);
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("image");
  const body = await response.body();
  expect(
    body.byteLength,
    "expected a non-trivial PNG body, not an empty/broken image",
  ).toBeGreaterThan(1000);
});
