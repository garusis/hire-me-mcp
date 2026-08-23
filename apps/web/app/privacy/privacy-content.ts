/**
 * The content model for the public privacy note (#81, `app/privacy/page.tsx`).
 * A pure function so the drift test (`privacy-content.test.ts`) can assert
 * the note's numbers and lists are *built from* — not a hand-copied
 * duplicate of — `@hire-me-mcp/core/analytics`'s exported metadata. The
 * page component only renders this; it never hardcodes a number or field
 * name of its own.
 */

import {
  type AnalyticsSurface,
  QUESTION_THEMES,
  type QuestionTheme,
  RETENTION_WINDOW_DAYS,
  SURFACES,
  TOOL_OUTCOMES,
  type ToolOutcome,
} from "@hire-me-mcp/core/analytics";

export interface ThirdPartyService {
  name: string;
  purpose: string;
}

export interface PrivacyContent {
  /** Sourced directly from `RETENTION_WINDOW_DAYS` — never a literal here. */
  retentionDays: number;
  surfaces: readonly AnalyticsSurface[];
  toolOutcomes: readonly ToolOutcome[];
  questionThemes: readonly QuestionTheme[];
  /** What is stored, in plain language. */
  collected: string[];
  /** What is never stored, in plain language. */
  neverCollected: string[];
  thirdPartyServices: ThirdPartyService[];
  noTrackingCookiesStatement: string;
}

/** Builds the privacy note's content model. See module doc — this is the single place the note's numbers and lists come from. */
export function buildPrivacyContent(): PrivacyContent {
  return {
    retentionDays: RETENTION_WINDOW_DAYS,
    surfaces: SURFACES,
    toolOutcomes: TOOL_OUTCOMES,
    questionThemes: QUESTION_THEMES,
    collected: [
      "Aggregated tool-call usage: which tool was called, from which surface (the public MCP endpoint or this site's chat), and its outcome.",
      "Question-theme labels for chat questions — a fixed set of topic buckets (e.g. experience, skills, availability), not the question text itself.",
      'Coarse response-latency buckets (e.g. "under 2s"), never an exact millisecond value.',
      "Page-level analytics via Vercel Analytics: page views and web vitals for this site, cookieless and first-party.",
    ],
    neverCollected: [
      "Raw question text or chat message contents — only a theme label, never the words asked.",
      "Tool call arguments or results.",
      "IP addresses.",
      "Identities, session identifiers, user agents, or any other value that could re-identify a visitor.",
      "Third-party advertising or tracking cookies of any kind.",
    ],
    thirdPartyServices: [
      { name: "Vercel", purpose: "hosting this site, and Vercel Analytics for page-level traffic" },
      { name: "Google Gemini", purpose: "processing chat questions and generating embeddings" },
      { name: "Neon", purpose: "the Postgres database usage events and career data are stored in" },
      { name: "Upstash", purpose: "rate limiting requests to the chat and MCP endpoints" },
    ],
    noTrackingCookiesStatement:
      "No third-party advertising or tracking cookies are set anywhere on this site.",
  };
}
