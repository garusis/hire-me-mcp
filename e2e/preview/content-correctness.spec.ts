import { loadContentDir, resolveDefaultContentDir } from "@hire-me-mcp/career-data";
import { expect, test } from "@playwright/test";

/**
 * Content-correctness spot checks (#58) — the mechanism behind the epic's
 * headline criterion. These import `packages/career-data` directly in the
 * test process (not through the deployed page) and assert that specific
 * rendered strings on the live preview equal the values the content layer
 * actually authored, so a hardcoded or hand-edited copy string in a page
 * component fails the build even though it "looks right."
 *
 * `loadContentDir`/`resolveDefaultContentDir` come straight from
 * `@hire-me-mcp/career-data`; `packages/core`'s domain services
 * (`getProfile`, `getSkillEvidence`, ...) wrap the same dataset with
 * citation-building the UI also goes through — reading the dataset
 * directly here keeps this suite's fixture lookups simple while still
 * asserting against the single canonical source both packages read from.
 */
const dataset = loadContentDir(resolveDefaultContentDir());

test("home page headline matches the profile record", async ({ page }) => {
  const { profile } = dataset;
  expect(profile, "packages/career-data has no profile.json authored").toBeTruthy();
  await page.goto("/");
  await expect(page.getByText(profile?.headline ?? "", { exact: false })).toBeVisible();
});

test("experience page renders a real experience entry's role and company", async ({ page }) => {
  const entry = dataset.experience.find(
    (candidate) => candidate.id === "house-numbers-2022-senior-full-stack-engineer",
  );
  expect(entry, "expected the House Numbers experience entry to exist in career-data").toBeTruthy();
  if (!entry) {
    return;
  }

  await page.goto("/experience");
  const card = page.locator(`#${entry.id}`);
  await expect(card.getByRole("heading", { level: 2 })).toHaveText(entry.company);
  await expect(card.getByText(entry.role, { exact: false })).toBeVisible();
});

test("project detail page renders the project's real tech stack", async ({ page }) => {
  const project = dataset.projects.find((candidate) => candidate.id === "cowork");
  expect(project, "expected the 'cowork' project to exist in career-data").toBeTruthy();
  if (!project) {
    return;
  }

  await page.goto(`/projects/${project.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(project.name);
  for (const tag of project.tech) {
    await expect(page.getByText(tag, { exact: true }).first()).toBeVisible();
  }
});

test("a skill's evidence link targets the real experience entry it cites", async ({ page }) => {
  const skill = dataset.skills.find(
    (candidate) =>
      candidate.evidence.length > 0 && candidate.evidence[0]?.entityType === "experience",
  );
  expect(skill, "expected at least one skill with experience evidence in career-data").toBeTruthy();
  const citation = skill?.evidence[0];
  if (!skill || !citation) {
    return;
  }

  await page.goto("/skills");
  const link = page.getByRole("link", { name: citation.label, exact: true }).first();
  await expect(link).toHaveAttribute("href", `/experience#${citation.entityId}`);
});

test("writing entries on /writing match career-data", async ({ page }) => {
  test.skip(
    dataset.writing.length === 0,
    "packages/career-data/content/writing has no entries authored yet",
  );
  const [entry] = dataset.writing;
  if (!entry) {
    return;
  }

  await page.goto("/writing");
  await expect(page.getByText(entry.title, { exact: false })).toBeVisible();
});
