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
 * per section and per role so a heading or highlight list never splits
 * across a page boundary, and `print-color-adjust: exact` so background
 * accents survive "Print backgrounds" being off by default in some
 * browsers. Every hyperlink's visible text is the URL itself (not just an
 * href), so contact info stays present in the PDF's extracted text and a
 * printed copy still has a usable, readable link.
 */

import type { CvView } from "../../src/lib/content/cv";

export interface RenderCvHtmlOptions {
  /** The site's own absolute origin, used only for the "more at" footer link — not a career fact. */
  siteUrl: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatPeriod(startDate: string, endDate: string | undefined): string {
  return `${startDate} – ${endDate ?? "Present"}`;
}

function formatEducationPeriod(startDate: string | undefined, endDate: string | undefined) {
  if (startDate === undefined && endDate === undefined) {
    return undefined;
  }
  if (startDate === undefined) {
    return endDate;
  }
  return formatPeriod(startDate, endDate);
}

/** A contact's visible link text — the URL itself (minus a `mailto:` prefix), so it survives PDF text extraction. */
function contactLinkText(url: string): string {
  return url.startsWith("mailto:") ? url.slice("mailto:".length) : url;
}

function renderContacts(contacts: CvView["profile"]["contacts"]): string {
  const items = contacts
    .map(
      (contact) =>
        `<a href="${escapeHtml(contact.url)}">${escapeHtml(contactLinkText(contact.url))}</a>`,
    )
    .join('<span aria-hidden="true"> &middot; </span>');
  return `<p class="contacts">${items}</p>`;
}

function renderExperience(experience: CvView["experience"]): string {
  const items = experience
    .map(
      (item) => `
      <article class="role">
        <div class="role-heading">
          <h3>${escapeHtml(item.company)} <span class="role-title">&mdash; ${escapeHtml(item.role)}</span></h3>
          <p class="period">${escapeHtml(formatPeriod(item.startDate, item.endDate))}</p>
        </div>
        <ul class="highlights">
          ${item.highlights.map((highlight) => `<li>${escapeHtml(highlight)}</li>`).join("")}
        </ul>
      </article>`,
    )
    .join("");
  return `<section><h2>Experience</h2>${items}</section>`;
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
        `<p><strong>${escapeHtml(PROFICIENCY_LABEL[group.proficiency])}:</strong> ${escapeHtml(
          group.names.join(", "),
        )}</p>`,
    )
    .join("");
  return `<section class="avoid-break"><h2>Skills</h2>${items}</section>`;
}

function renderEducation(education: CvView["education"]): string {
  const items = education
    .map((entry) => {
      const period = formatEducationPeriod(entry.startDate, entry.endDate);
      return `<p><strong>${escapeHtml(entry.institution)}</strong> &mdash; ${escapeHtml(entry.credential)}${
        period !== undefined ? ` <span class="period">(${escapeHtml(period)})</span>` : ""
      }</p>`;
    })
    .join("");
  return `<section class="avoid-break"><h2>Education</h2>${items}</section>`;
}

const STYLE = `
  @page { size: A4; margin: 14mm 16mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    color: #111;
    background: #fff;
    font-family: Georgia, "Times New Roman", Times, serif;
    font-size: 10pt;
    line-height: 1.35;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  h1, h2, h3 { font-family: Arial, Helvetica, sans-serif; margin: 0; }
  h1 { font-size: 20pt; }
  h2 {
    font-size: 11pt;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid #999;
    margin: 10pt 0 6pt;
    break-after: avoid;
  }
  h3 { font-size: 10.5pt; }
  a { color: #111; word-break: break-all; }
  .headline { font-size: 12pt; margin: 2pt 0 0; }
  .location { margin: 2pt 0 0; color: #333; }
  .contacts { margin: 4pt 0 8pt; }
  .summary { margin: 6pt 0 0; }
  section { break-inside: avoid-page; }
  section.avoid-break { break-inside: avoid; }
  .role { break-inside: avoid; margin-bottom: 6pt; }
  .role-heading { display: flex; justify-content: space-between; align-items: baseline; gap: 8pt; }
  .role-title { font-weight: normal; }
  .period { white-space: nowrap; color: #333; margin: 0; }
  .highlights { margin: 2pt 0 0; padding-left: 14pt; }
  .highlights li { margin: 0 0 1pt; }
  footer { margin-top: 10pt; font-size: 8pt; color: #555; }
`;

/**
 * Renders `view` into a complete, self-contained HTML document — real
 * text, print CSS, print-safe fonts, and clickable/selectable hyperlinks.
 * `options.siteUrl` is only used for the closing "more at" link, not for
 * any career fact.
 */
export function renderCvHtml(view: CvView, options: RenderCvHtmlOptions): string {
  const { profile } = view;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(profile.name)} — CV</title>
<style>${STYLE}</style>
</head>
<body>
  <header>
    <h1>${escapeHtml(profile.name)}</h1>
    <p class="headline">${escapeHtml(profile.headline)}</p>
    <p class="location">${escapeHtml(profile.location)}</p>
    ${renderContacts(profile.contacts)}
    <p class="summary">${escapeHtml(profile.summary)}</p>
  </header>
  ${renderExperience(view.experience)}
  ${renderSkills(view.skillsByProficiency)}
  ${renderEducation(view.education)}
  <footer>Generated from live career data — see ${escapeHtml(options.siteUrl)}</footer>
</body>
</html>`;
}
