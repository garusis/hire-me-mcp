import { expect, test } from "@playwright/test";
import { collectConsoleErrors, setTheme } from "./helpers";

/**
 * Navigation across every route, driven through the header nav and in-page
 * links (not `page.goto` shortcuts), with zero console errors — the first
 * bullet of #58's Scope. Content-correctness, a11y and responsive checks
 * live in their own specs; this one is purely "can a user get there and
 * does the page stay quiet."
 */
const HEADER_LINKS: ReadonlyArray<{ label: string; path: string; heading: string }> = [
  { label: "Home", path: "/", heading: "Marcos Javier Alvarez" },
  { label: "Experience", path: "/experience", heading: "Experience" },
  { label: "Projects", path: "/projects", heading: "Projects" },
  { label: "Skills", path: "/skills", heading: "Skills" },
  { label: "Writing", path: "/writing", heading: "Writing" },
];

for (const link of HEADER_LINKS) {
  test(`header nav reaches ${link.path} with no console errors`, async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: link.label, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`${link.path}$`));
    await expect(page.getByRole("heading", { level: 1 })).toContainText(link.heading);
    expect(errors, `console errors on ${link.path}:\n${errors.join("\n")}`).toEqual([]);
  });
}

test("home page's MCP CTA reaches the /mcp route with no console errors", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/");
  await page.getByRole("link", { name: "Explore the MCP endpoint" }).click();
  await expect(page).toHaveURL(/\/mcp$/);
  await expect(page.getByRole("heading", { level: 1, name: "Add me to your AI" })).toBeVisible();
  expect(errors, `console errors on /mcp:\n${errors.join("\n")}`).toEqual([]);
});

test("projects list links through to a project detail page with no console errors", async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await page.goto("/projects");
  await page.getByRole("link", { name: "cowork", exact: true }).first().click();
  await expect(page).toHaveURL(/\/projects\/cowork$/);
  await expect(page.getByRole("heading", { level: 1, name: "cowork" })).toBeVisible();
  expect(errors, `console errors on /projects/cowork:\n${errors.join("\n")}`).toEqual([]);
});

test("an unknown project slug renders the not-found page, not a crash", async ({ page }) => {
  const response = await page.goto("/projects/this-slug-does-not-exist");
  expect(response?.status()).toBe(404);
});

test("theme toggle persists across a reload", async ({ page }) => {
  await page.goto("/");
  await setTheme(page, "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await setTheme(page, "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
