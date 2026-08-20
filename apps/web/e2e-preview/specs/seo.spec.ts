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
  const [project] = dataset.projects;
  if (project === undefined) {
    test.skip(true, "no projects authored");
    return;
  }
  const response = await request.get(`${baseURL}/projects/${slugify(project.id)}/opengraph-image`);
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("image");
});
