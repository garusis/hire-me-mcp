import { EXPECTED_TOOL_NAMES } from "../../lib/mcp/tool-names";
import { dataset, profile, slugify } from "../helpers/dataset";
import { expect, test } from "../helpers/fixtures";
import { ROUTES } from "../helpers/routes";

/**
 * SEO artifact checks (#58, extended by #38): `sitemap.xml` and
 * `robots.txt` are reachable and well-formed, every route carries a
 * canonical tag plus a full Open Graph/Twitter card set, the OG image
 * endpoints (default + per-entity, #44) return real >=1200x630 images, and
 * `/.well-known/mcp.json` (#38's project-convention MCP discovery
 * descriptor — see that route's module doc for why nothing spec-defined
 * applies to this no-auth server) matches the real tool registry.
 */

/** Reads a PNG's width/height straight from its IHDR chunk (bytes 16-23 of any valid PNG), no image-parsing dependency needed. */
function readPngDimensions(body: Buffer): { width: number; height: number } {
  return { width: body.readUInt32BE(16), height: body.readUInt32BE(20) };
}

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

for (const route of ROUTES) {
  test(`${route.name} renders a full Open Graph + Twitter card meta set`, async ({
    gotoRoute,
    page,
  }) => {
    await gotoRoute(route.path);

    const ogTitle = page.locator('meta[property="og:title"]');
    const ogDescription = page.locator('meta[property="og:description"]');
    const ogUrl = page.locator('meta[property="og:url"]');
    const ogType = page.locator('meta[property="og:type"]');
    const ogImage = page.locator('meta[property="og:image"]');
    const twitterCard = page.locator('meta[name="twitter:card"]');

    await expect(ogTitle).toHaveCount(1);
    await expect(ogDescription).toHaveCount(1);
    await expect(ogUrl).toHaveCount(1);
    await expect(ogType).toHaveCount(1);
    await expect(ogImage).toHaveCount(1);
    await expect(twitterCard).toHaveCount(1);

    expect(await ogTitle.getAttribute("content")).not.toBe("");
    expect(await ogDescription.getAttribute("content")).not.toBe("");
    const url = await ogUrl.getAttribute("content");
    expect(url, "og:url must be an absolute URL").toMatch(/^https?:\/\//);
    expect(url).toContain(route.path === "/" ? "/" : route.path);
    expect(await ogType.getAttribute("content")).not.toBe("");
    expect(await ogImage.getAttribute("content"), "og:image must be an absolute URL").toMatch(
      /^https?:\/\//,
    );
    expect(await twitterCard.getAttribute("content")).toBe("summary_large_image");
  });
}

for (const route of ROUTES) {
  test(`${route.name} emits title and social metadata inside <head>, not streamed into <body> (#235)`, async ({
    request,
    baseURL,
  }) => {
    // Raw HTML fetch with no JS execution — exactly what a link-preview
    // scraper (Slack, LinkedIn, WhatsApp) sees. Next 15 streams metadata
    // into <body> on dynamic routes unless configured otherwise
    // (`htmlLimitedBots` in next.config.ts); this pins the configuration.
    const response = await request.get(`${baseURL}${route.path}`);
    expect(response.ok()).toBe(true);
    const html = await response.text();
    const headEnd = html.indexOf("</head>");
    expect(headEnd).toBeGreaterThan(-1);
    for (const marker of [
      "<title",
      'property="og:title"',
      'property="og:description"',
      'property="og:image"',
      'name="twitter:card"',
      'rel="canonical"',
    ]) {
      const at = html.indexOf(marker);
      expect(at, `${marker} must be present in the raw HTML`).toBeGreaterThan(-1);
      expect(at, `${marker} must appear before </head>`).toBeLessThan(headEnd);
    }
  });
}

test("the home og:description is share-preview sized and og:title carries the headline (#236)", async ({
  gotoRoute,
  page,
}) => {
  await gotoRoute("/");

  const ogDescription = await page
    .locator('meta[property="og:description"]')
    .getAttribute("content");
  expect(ogDescription).toBeTruthy();
  // The profile schema caps `shortSummary` at 200 chars; share previews and
  // SERP snippets truncate around 120-200, so the emitted description must
  // never regress to the full About paragraph.
  expect(ogDescription?.length).toBeLessThanOrEqual(200);

  const ogTitle = await page.locator('meta[property="og:title"]').getAttribute("content");
  expect(ogTitle).toBe(`${profile.name} — ${profile.headline}`);
});

test("the default Open Graph image endpoint returns an image at least 1200x630", async ({
  request,
  baseURL,
}) => {
  const response = await request.get(`${baseURL}/opengraph-image`);
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("image");
  const { width, height } = readPngDimensions(await response.body());
  expect(width).toBeGreaterThanOrEqual(1200);
  expect(height).toBeGreaterThanOrEqual(630);
});

test("GET /.well-known/mcp.json returns 200, application/json, and a tool list matching the real MCP tool registry", async ({
  request,
  baseURL,
}) => {
  const response = await request.get(`${baseURL}/.well-known/mcp.json`);
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("application/json");

  const body = await response.json();
  expect(body.serverName).toBe("hire-me-mcp");
  expect(body.transport).toBe("streamable-http");
  expect(body.auth).toBe("none");
  expect(body.endpointUrl).toBe(`${baseURL}/api/mcp`);
  expect(body.tools.map((tool: { name: string }) => tool.name)).toEqual([...EXPECTED_TOOL_NAMES]);
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
