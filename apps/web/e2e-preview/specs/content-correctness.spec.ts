import type { Citation } from "@hire-me-mcp/core";
import { dataset, experience, profile, slugify } from "../helpers/dataset";
import { expect, test } from "../helpers/fixtures";

/**
 * Content-correctness spot checks (#58) — the headline mechanism of this
 * epic. Each assertion below reads a real value from `packages/career-data`
 * via `packages/core` (`helpers/dataset.ts`, imported independently of the
 * page components under test) and asserts the deployed page renders that
 * exact value, not a paraphrase or a hardcoded string. A hardcoded/edited
 * copy string in a page component makes the corresponding assertion fail —
 * demonstrated once, deliberately, and reverted; see the PR description for
 * #58 for the before/after failure output.
 */

test("home page renders the real profile headline and name", async ({ gotoRoute, page }) => {
  await gotoRoute("/");
  await expect(page.getByRole("heading", { level: 1, name: profile.name })).toBeVisible();
  await expect(page.getByText(profile.headline, { exact: true })).toBeVisible();
  await expect(page.getByText(profile.summary, { exact: true })).toBeVisible();
});

test("experience page renders the latest real experience entry", async ({ gotoRoute, page }) => {
  const [latest] = experience;
  if (latest === undefined) {
    test.skip(true, "no experience entries authored");
    return;
  }
  await gotoRoute("/experience");
  await expect(page.getByRole("heading", { level: 2, name: latest.company })).toBeVisible();
  const card = page.locator(`#${slugify(latest.id)}`);
  await expect(card.getByText(latest.role, { exact: true })).toBeVisible();
  await expect(card.getByText(latest.summary, { exact: true })).toBeVisible();
});

test("a project detail page renders its real stack", async ({ gotoRoute, page }) => {
  const [project] = dataset.projects;
  if (project === undefined) {
    test.skip(true, "no projects authored");
    return;
  }
  await gotoRoute(`/projects/${slugify(project.id)}`);
  await expect(page.getByRole("heading", { level: 1, name: project.name })).toBeVisible();
  await expect(page.getByText(project.summary, { exact: true })).toBeVisible();
  for (const tag of project.tech) {
    await expect(page.getByText(tag, { exact: true }).first()).toBeVisible();
  }
});

/** The citation's route on `/skills`, mirroring `apps/web/app/skills/citation-href.ts`'s `experience`/`project` cases (the two entity types real evidence today cites). */
function expectedSkillEvidenceHref(citation: Citation): string | undefined {
  if (citation.entityType === "experience") {
    return `/experience#${slugify(citation.entityId)}`;
  }
  if (citation.entityType === "project") {
    return `/projects/${slugify(citation.entityId)}`;
  }
  return undefined;
}

test("skills page renders a real skill's evidence citation, linking to its real target", async ({
  gotoRoute,
  page,
}) => {
  const skillWithResolvableEvidence = dataset.skills.find((skill) =>
    skill.evidence.some((citation) => expectedSkillEvidenceHref(citation) !== undefined),
  );
  if (skillWithResolvableEvidence === undefined) {
    test.skip(true, "no skill has evidence citing experience or a project");
    return;
  }
  const citation = skillWithResolvableEvidence.evidence.find(
    (candidate) => expectedSkillEvidenceHref(candidate) !== undefined,
  );
  if (citation === undefined) {
    throw new Error("unreachable: filtered above");
  }
  const expectedHref = expectedSkillEvidenceHref(citation);

  await gotoRoute("/skills");
  const skillCard = page.locator(`#${slugify(skillWithResolvableEvidence.id)}`);
  await expect(
    skillCard.getByRole("heading", { name: skillWithResolvableEvidence.name }),
  ).toBeVisible();
  const evidenceLink = skillCard.getByRole("link", { name: citation.label });
  await expect(evidenceLink).toBeVisible();
  await expect(evidenceLink).toHaveAttribute("href", expectedHref ?? "");
});

test("writing page renders real writing entries, or the documented empty state", async ({
  gotoRoute,
  page,
}) => {
  await gotoRoute("/writing");
  if (dataset.writing.length === 0) {
    await expect(page.getByText("Nothing published here yet — check back later.")).toBeVisible();
    return;
  }
  const [entry] = dataset.writing;
  if (entry === undefined) {
    throw new Error("unreachable: length checked above");
  }
  await expect(page.getByRole("link", { name: entry.title })).toBeVisible();
  await expect(page.getByText(entry.summary, { exact: true })).toBeVisible();
});

test("mcp page's title is sourced from the real profile name", async ({ gotoRoute, page }) => {
  await gotoRoute("/mcp");
  await expect(page).toHaveTitle(
    new RegExp(`\\| ${profile.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
  );
});
