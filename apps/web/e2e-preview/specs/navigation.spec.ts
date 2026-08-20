import { expect, test } from "../helpers/fixtures";
import { ROUTES } from "../helpers/routes";

/**
 * Navigation coverage (#58): every route loads with no console errors, the
 * header's primary nav reaches every top-level route, in-page links reach
 * the routes without their own header entry (project detail, `/mcp`), the
 * skip link (#15) jumps keyboard focus into `<main>`, and an unknown
 * project slug renders the documented not-found page instead of a broken
 * route.
 */

for (const route of ROUTES) {
  test(`${route.name} — loads with no console errors`, async ({
    gotoRoute,
    page,
    consoleErrors,
  }) => {
    const response = await gotoRoute(route.path);
    expect(response?.ok(), `expected ${route.path} to respond ok()`).toBe(true);
    await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
    expect(
      consoleErrors.errors,
      `expected no console errors on ${route.path}, got: ${consoleErrors.errors.join("; ")}`,
    ).toEqual([]);
  });
}

test("header navigation reaches every top-level route", async ({ gotoRoute, page }) => {
  await gotoRoute("/");
  const nav = page.getByRole("navigation", { name: "Primary" });

  for (const { path, heading } of ROUTES.filter((route) =>
    ["/", "/experience", "/projects", "/skills", "/writing"].includes(route.path),
  )) {
    const label = heading === "Marcos Javier Alvarez" ? "Home" : heading;
    await nav.getByRole("link", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path === "/" ? "/$" : `${path}$`}`));
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
});

test("in-page link reaches the MCP section from the home page", async ({ gotoRoute, page }) => {
  await gotoRoute("/");
  await page.getByRole("link", { name: "Explore the MCP endpoint" }).click();
  await expect(page).toHaveURL(/\/mcp$/);
  await expect(page.getByRole("heading", { level: 1, name: "Add me to your AI" })).toBeVisible();
});

test("in-page link reaches a project detail page from the projects list", async ({
  gotoRoute,
  page,
}) => {
  await gotoRoute("/projects");
  const firstProjectLink = page.getByRole("article").first().getByRole("link").first();
  const projectName = await firstProjectLink.textContent();
  await firstProjectLink.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(projectName ?? "");
});

test("skip link moves keyboard focus into main content", async ({ gotoRoute, page }) => {
  await gotoRoute("/");
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  const main = page.locator("main");
  await expect(main).toBeVisible();
});

test("unknown project slug renders a not-found page", async ({ gotoRoute, page }) => {
  const response = await gotoRoute("/projects/this-slug-does-not-exist-zzz");
  expect(response?.status()).toBe(404);
  await expect(page.getByText(/not found|404/i).first()).toBeVisible();
});
