/**
 * Renders a complete, self-contained CV HTML document (#35) from a
 * {@link CvView} — every visible career fact is a field of `view`, never a
 * literal in this module (`render-cv-html.test.ts`'s guard test asserts
 * this against real career-data strings). This is the single source
 * `app/cv/print/route.ts` (a browsable, visually reviewable route) and
 * `scripts/generate-cv-pdf-cli.ts` (the headless PDF renderer) both call —
 * no server or network round-trip is required to render it, so the PDF
 * generation script can call this function directly.
 *
 * Print-safe by design: system font stacks only (no embedded/remote
 * webfonts, so PDF text stays real, selectable text rather than a
 * rasterized substitute), `@page`/`break-inside: avoid` page-break control
 * per entry so a role or project never splits across a page boundary, and
 * `print-color-adjust: exact` so background accents survive "Print
 * backgrounds" being off by default in some browsers. Every hyperlink's
 * visible text is a readable, bare-domain form of the URL (`display()`
 * below), while `href` always keeps the full URL, so contact info stays
 * present and usable in a printed copy or the PDF's extracted text.
 *
 * Markup and stylesheet (#299) mirror the personal reference CV
 * (`Marcos-Alvarez-CV-2026.html`): a single `.sheet` column, `h2` section
 * headings with flat `.entry` blocks underneath (no `<section>`,
 * `<article>`, `<header>`, `<footer>`, `h3`), Letter page size, and an
 * italic `.tech` line per role.
 */

import type { CvView } from "../../src/lib/content/cv";

export interface RenderCvHtmlOptions {
  /** The site's own absolute origin, used only for the header's "portfolio" link — not a career fact. */
  siteUrl: string;
  /**
   * The absolute public MCP endpoint URL (#232), used only for the header's
   * "query this CV over MCP" callout — site configuration (like `siteUrl`),
   * not a career fact. The browsable route derives it via
   * `getMcpEndpointUrl()`; the headless PDF renderer passes the fixed
   * production value.
   */
  mcpUrl: string;
  /**
   * CSP nonce to stamp on the inline `<style>` (#76). The browsable
   * `/cv/print` route serves this document under the proxy's
   * nonce-scoped `style-src` policy, so the style tag must carry the
   * request's nonce or the browser blocks it. The headless PDF renderer
   * loads the document with no CSP at all and omits this.
   */
  nonce?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** `YYYY-MM` -> `Mon YYYY` (`2022-05` -> `May 2022`). */
function formatMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-");
  const monthName = MONTH_NAMES[Number(month) - 1] ?? month;
  return `${monthName} ${year}`;
}

/**
 * `startDate`/`endDate` -> a human period. An open end renders `Present`;
 * a start and end in the same month (e.g. a one-month certificate) render
 * just that one month rather than `Mon YYYY – Mon YYYY`.
 */
function formatPeriod(startDate: string, endDate: string | undefined): string {
  const start = formatMonth(startDate);
  if (endDate === undefined) {
    return `${start} – Present`;
  }
  if (endDate === startDate) {
    return start;
  }
  return `${start} – ${formatMonth(endDate)}`;
}

function formatEducationPeriod(startDate: string | undefined, endDate: string | undefined) {
  if (startDate === undefined && endDate === undefined) {
    return undefined;
  }
  if (startDate === undefined) {
    return formatMonth(endDate as string);
  }
  return formatPeriod(startDate, endDate);
}

/**
 * A link's visible display text (#299): `mailto:` shows the bare address;
 * any other URL is shown with its scheme, a leading `www.`, and one
 * trailing slash stripped (`https://www.linkedin.com/in/garusis/` ->
 * `linkedin.com/in/garusis`). The `href` always keeps the full URL, so
 * this is purely cosmetic — it never affects where the link goes.
 */
function display(url: string): string {
  if (url.startsWith("mailto:")) {
    return url.slice("mailto:".length);
  }
  const withoutScheme = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const withoutWww = withoutScheme.replace(/^www\./i, "");
  return withoutWww.endsWith("/") ? withoutWww.slice(0, -1) : withoutWww;
}

function link(url: string): string {
  return `<a href="${escapeHtml(url)}">${escapeHtml(display(url))}</a>`;
}

function renderHeader(
  profile: CvView["profile"],
  options: Pick<RenderCvHtmlOptions, "siteUrl" | "mcpUrl">,
): string {
  const contacts = profile.contacts.map((contact) => link(contact.url)).join(" &middot; ");
  return `
  <h1>${escapeHtml(profile.name)}</h1>
  <p class="contact"><strong>${escapeHtml(profile.headline)}</strong></p>
  <p class="contact-line">${escapeHtml(profile.location)} &middot; ${contacts}</p>
  <p class="contact"><strong>Portfolio &amp; detailed career evidence:</strong> ${link(
    options.siteUrl,
  )} &middot; <strong>Query it from any MCP client:</strong> <a href="${escapeHtml(
    options.mcpUrl,
  )}">${escapeHtml(options.mcpUrl)}</a></p>`;
}

function renderSummary(summary: string): string {
  return `
  <h2>Summary</h2>
  <p>${escapeHtml(summary)}</p>`;
}

function renderExperience(experience: CvView["experience"]): string {
  const items = experience
    .map((item) => {
      const highlights = item.highlights
        .map((highlight) => `<li>${escapeHtml(highlight)}</li>`)
        .join("");
      const tech =
        item.tech.length === 0
          ? ""
          : `\n    <p class="tech">Tech: ${escapeHtml(item.tech.join(", "))}.</p>`;
      return `
  <div class="entry">
    <p class="role"><strong>${escapeHtml(item.company)}</strong> &mdash; ${escapeHtml(
      item.role,
    )} &middot; ${escapeHtml(formatPeriod(item.startDate, item.endDate))}</p>
    <ul>${highlights}</ul>${tech}
  </div>`;
    })
    .join("");
  return `
  <h2>Experience</h2>${items}`;
}

/**
 * Selected projects (#232): name, role, one-line summary and the authored
 * links displayed as bare domains with the full URL as the `href` (so,
 * like contacts, they read cleanly and still survive PDF text extraction)
 * — for the flagship project those links include the public MCP endpoint.
 * The heading stays "Selected Projects" rather than "Personal Projects":
 * the set includes employer work too.
 */
function renderProjects(projects: CvView["projects"]): string {
  if (projects.length === 0) {
    return "";
  }
  const items = projects
    .map((project) => {
      const links = project.links
        .map((projectLink) => ` &middot; ${link(projectLink.url)}`)
        .join("");
      return `
  <div class="entry">
    <p class="role"><strong>${escapeHtml(project.name)}</strong> &mdash; ${escapeHtml(
      project.role,
    )}${links}</p>
    <ul><li>${escapeHtml(project.summary)}</li></ul>
  </div>`;
    })
    .join("");
  return `
  <h2>Selected Projects</h2>${items}`;
}

const PROFICIENCY_LABEL: Record<CvView["skillsByProficiency"][number]["proficiency"], string> = {
  expert: "Expert",
  proficient: "Proficient",
  familiar: "Familiar",
};

function renderSkills(groups: CvView["skillsByProficiency"]): string {
  const items = groups
    .map(
      (group) =>
        `<li><strong>${escapeHtml(PROFICIENCY_LABEL[group.proficiency])}:</strong> ${escapeHtml(
          group.names.join(", "),
        )}.</li>`,
    )
    .join("");
  return `
  <h2>Skills</h2>
  <ul>${items}</ul>`;
}

function renderEducation(education: CvView["education"]): string {
  const items = education
    .map((entry) => {
      const period = formatEducationPeriod(entry.startDate, entry.endDate);
      return `<li>${escapeHtml(entry.institution)} &mdash; ${escapeHtml(entry.credential)}${
        period !== undefined ? ` (${escapeHtml(period)})` : ""
      }</li>`;
    })
    .join("");
  return `
  <h2>Education</h2>
  <ul>${items}</ul>`;
}

const STYLE = `
  @page { size: Letter; margin: 0.7in; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0; color: #000; background: #fff;
    font-family: Arial, "Helvetica Neue", Helvetica, "Liberation Sans", sans-serif;
    font-size: 11pt; line-height: 1.5;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .sheet { max-width: 6.5in; margin: 0 auto; padding: 1in 0; }
  p { margin: 0 0 11pt; orphans: 3; widows: 3; }
  a { color: inherit; text-decoration: none; }
  h1 { font-size: 20pt; line-height: 1.2; font-weight: bold; margin: 0 0 4pt; }
  h2 { font-size: 13pt; line-height: 1.3; font-weight: bold; margin: 16pt 0 8pt; page-break-after: avoid; break-after: avoid; }
  .contact { margin: 0 0 4pt; }
  .contact-line { margin: 0 0 11pt; }
  .role { margin: 0 0 6pt; page-break-after: avoid; break-after: avoid; }
  .entry { margin: 0 0 14pt; page-break-inside: avoid; break-inside: avoid; }
  ul { margin: 0 0 6pt; padding-left: 18pt; }
  li { margin: 0 0 5pt; orphans: 2; widows: 2; }
  .tech { font-style: italic; margin: 0; }
  @media print { .sheet { max-width: none; margin: 0; padding: 0; } }
`;

/**
 * Renders `view` into a complete, self-contained HTML document — real
 * text, print CSS, print-safe fonts, and clickable/selectable hyperlinks.
 * `options.siteUrl` and `options.mcpUrl` are only used for the header's
 * portfolio/MCP callout line, not for any career fact.
 */
export function renderCvHtml(view: CvView, options: RenderCvHtmlOptions): string {
  const { profile } = view;
  const styleTag =
    options.nonce === undefined ? "<style>" : `<style nonce="${escapeHtml(options.nonce)}">`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="icon" href="/icon" />
<title>${escapeHtml(profile.name)} — CV</title>
${styleTag}${STYLE}</style>
</head>
<body>
<div class="sheet">${renderHeader(profile, options)}
${renderSummary(profile.summary)}
${renderExperience(view.experience)}
${renderProjects(view.projects)}
${renderSkills(view.skillsByProficiency)}
${renderEducation(view.education)}
</div>
</body>
</html>`;
}
