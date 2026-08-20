import { dataset } from "../helpers/dataset";
import { expect, test } from "../helpers/fixtures";

/**
 * Project filter behaviour and shareable URLs (#58) — `/projects` filters
 * by tech tag via the `?tags=` query param (`apps/web/app/projects/filters.ts`),
 * server-rendered rather than client-side, so a filtered view is a real,
 * shareable, reloadable link.
 */

function firstSharedTag(): string {
  const tagCounts = new Map<string, number>();
  for (const project of dataset.projects) {
    for (const tag of project.tech) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const shared = [...tagCounts.entries()].find(([, count]) => count > 0);
  if (shared === undefined) {
    throw new Error("preview e2e: no project has any tech tag to filter by");
  }
  return shared[0];
}

test("filtering by a tag narrows the list and produces a shareable URL", async ({
  gotoRoute,
  page,
}) => {
  const tag = firstSharedTag();
  const expectedCount = dataset.projects.filter((project) => project.tech.includes(tag)).length;

  await gotoRoute("/projects");
  await page.getByRole("link", { name: tag, exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`\\?tags=${encodeURIComponent(tag)}$`));
  await expect(page.getByRole("article")).toHaveCount(expectedCount);

  // Reload the filtered URL directly — proves the filter state lives in the
  // URL, not client-only state, so the link is genuinely shareable.
  await page.reload();
  await expect(page.getByRole("article")).toHaveCount(expectedCount);

  await page.getByRole("link", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole("article")).toHaveCount(dataset.projects.length);
});
