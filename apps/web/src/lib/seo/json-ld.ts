/**
 * Structured-data (JSON-LD) builders for #44. Each function takes a
 * content-layer view (never the career-data package directly — see
 * `content-source-guard.test.ts`) and returns a plain schema.org object;
 * pages render it via `JsonLdScript` (`json-ld-script.tsx`). Every value
 * comes straight from the view passed in — no career fact is hardcoded
 * here.
 */

import { getSiteUrl } from "../config/site-url";
import type { ProfileView, ProjectListItemView, WritingListItemView } from "../content";

interface PersonRef {
  "@type": "Person";
  name: string;
}

export interface PersonJsonLd {
  "@context": "https://schema.org";
  "@type": "Person";
  name: string;
  jobTitle: string;
  description: string;
  url: string;
  sameAs: string[];
}

export interface ProjectJsonLd {
  "@context": "https://schema.org";
  "@type": "SoftwareSourceCode";
  name: string;
  description: string;
  url: string;
  programmingLanguage: string[];
  codeRepository: string | undefined;
  author: PersonRef;
}

export interface ArticleJsonLd {
  "@context": "https://schema.org";
  "@type": "Article";
  headline: string;
  description: string;
  datePublished: string;
  url: string;
  author: PersonRef;
}

const CODE_HOST_PATTERN = /github\.com|gitlab\.com|bitbucket\.org/i;

/** `Person` JSON-LD for the home page, built from the site's profile view. */
export function buildPersonJsonLd(view: ProfileView, siteUrl: string = getSiteUrl()): PersonJsonLd {
  const { profile } = view;
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: profile.name,
    jobTitle: profile.headline,
    description: profile.summary,
    url: siteUrl,
    sameAs: profile.contacts.map((contact) => contact.url),
  };
}

/**
 * `SoftwareSourceCode` JSON-LD for a project detail page. `codeRepository`
 * is the first project link that points at a recognized code host, if any
 * — not every project link is a repository.
 */
export function buildProjectJsonLd(
  item: ProjectListItemView,
  authorName: string,
  siteUrl: string = getSiteUrl(),
): ProjectJsonLd {
  const { project, slug } = item;
  const codeRepository = project.links.find((link) => CODE_HOST_PATTERN.test(link.url))?.url;
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareSourceCode",
    name: project.name,
    description: project.summary,
    url: `${siteUrl}/projects/${slug}`,
    programmingLanguage: project.tech,
    codeRepository,
    author: { "@type": "Person", name: authorName },
  };
}

/** `Article` JSON-LD for a locally-hosted writing entry's detail page. */
export function buildArticleJsonLd(
  item: WritingListItemView,
  authorName: string,
  siteUrl: string = getSiteUrl(),
): ArticleJsonLd {
  const { entry, slug } = item;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: entry.title,
    description: entry.summary,
    datePublished: entry.publishedDate,
    url: `${siteUrl}/writing/${slug}`,
    author: { "@type": "Person", name: authorName },
  };
}
