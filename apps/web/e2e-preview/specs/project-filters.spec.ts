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

/**
 * A tag that at least one project carries, at least one does NOT, and whose
 * upper-cased spelling differs from the authored one — so a case-insensitive
 * match is observably different from both "no filter" and "no results".
 */
function narrowingTag(): string {
  const tag = [...new Set(dataset.projects.flatMap((project) => project.tech))].find(
    (candidate) => {
      const matches = dataset.projects.filter((project) => project.tech.includes(candidate)).length;
      return (
        matches > 0 && matches < dataset.projects.length && candidate.toUpperCase() !== candidate
      );
    },
  );
  if (tag === undefined) {
    throw new Error("preview e2e: no tag both narrows the project list and has a distinct casing");
  }
  return tag;
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

/**
 * Issue 274 — the tag filter used to be case-sensitive while the MCP server
 * guaranteed case-insensitive matching (issue 226), so `?tags=TypeScript`
 * (exactly what an agent builds from the sample prompt the `/mcp` page
 * advertises) returned the whole unfiltered portfolio, under a notice
 * claiming no project lists that technology.
 */
test("a differently-cased tag in the URL filters the same way the canonical one does", async ({
  gotoRoute,
  page,
}) => {
  const tag = narrowingTag();
  const expectedCount = dataset.projects.filter((project) => project.tech.includes(tag)).length;

  await gotoRoute(`/projects?tags=${encodeURIComponent(tag.toUpperCase())}`);

  await expect(page.getByRole("article")).toHaveCount(expectedCount);
  await expect(page.getByText(/ignored an unknown tag/i)).toHaveCount(0);
});
