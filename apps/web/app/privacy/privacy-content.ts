/**
 * The content model for the public privacy note (#81, `app/privacy/page.tsx`).
 * A pure function so the drift test (`privacy-content.test.ts`) can assert
 * the note's numbers and lists are *built from* — not a hand-copied
 * duplicate of — `@hire-me-mcp/core/analytics`'s exported metadata. The
 * page component only renders this; it never hardcodes a number or field
 * name of its own.
 *
 * Issue 239 extended that rule to the chat endpoint itself: the note now
 * describes the `sessionId` every `POST /api/chat` request must carry, and
 * the field list, the rate-limit window, and the "not stored with usage
 * events" claim are all read from `lib/chat/request-schema.ts`,
 * `lib/chat/rate-limit.ts` and the analytics event types respectively —
 * two of them enforced at compile time (see `CHAT_REQUEST_FIELD_PURPOSES`
 * and `ANALYTICS_EVENTS_HAVE_NO_SESSION_FIELD` below).
 */

import {
  type AnalyticsSurface,
  QUESTION_THEMES,
  type QuestionEventInput,
  type QuestionTheme,
  RETENTION_WINDOW_DAYS,
  SURFACES,
  TOOL_OUTCOMES,
  type ToolEventInput,
  type ToolOutcome,
} from "@hire-me-mcp/core/analytics";
import { readChatRateLimitConfig } from "../../lib/chat/rate-limit";
import { type ChatRequestBody, chatRequestSchema } from "../../lib/chat/request-schema";

export interface ThirdPartyService {
  name: string;
  purpose: string;
}

/** One top-level field of a `POST /api/chat` request body, with what it is for in plain language. */
export interface ChatRequestField {
  /** Read off `chatRequestSchema`'s own shape — never a literal typed here. */
  name: string;
  purpose: string;
}

/**
 * The honest account of the chat session identifier (issue 239). The page
 * previously claimed session identifiers were never collected while
 * `POST /api/chat` has always *required* one; every value below is derived
 * from the code that actually handles it rather than restated by hand.
 */
export interface SessionIdentifierNote {
  /** The request field's real name, proven against `chatRequestSchema` by the drift test. */
  fieldName: string;
  /**
   * Whether a stored usage-analytics event carries the session id. `false`,
   * and structurally so: neither analytics event type has a session field —
   * see {@link ANALYTICS_EVENTS_HAVE_NO_SESSION_FIELD} for the compile-time
   * proof and `privacy-content.test.ts` for the runtime one.
   */
  storedWithUsageEvents: boolean;
  /** The live per-session rate-limit window, from `readChatRateLimitConfig()`. */
  rateLimitWindowSeconds: number;
  /** The plain-language explanation the page renders, built from the values above. */
  statements: string[];
}

/**
 * Compile-time proof for `storedWithUsageEvents: false`. If either analytics
 * event type ever gains a session/caller field, `SessionFieldOf` stops
 * resolving to `never`, the assertion type resolves to `never`, and
 * `typecheck` fails here — before the page's "never written to the usage
 * database" sentence can quietly go stale.
 */
type SessionFieldOf<T> = Extract<keyof T, `${string}ession${string}`>;
type NoSessionField<T> = [SessionFieldOf<T>] extends [never] ? true : never;
const ANALYTICS_EVENTS_HAVE_NO_SESSION_FIELD: NoSessionField<ToolEventInput> &
  NoSessionField<QuestionEventInput> = true;

/**
 * What each `POST /api/chat` field is for. Typed as a total record over the
 * request body's keys, so adding a field to `chatRequestSchema` without
 * describing it here — or describing one the schema no longer has — is a
 * `typecheck` failure, not a silently stale privacy page.
 */
const CHAT_REQUEST_FIELD_PURPOSES: Record<keyof ChatRequestBody, string> = {
  sessionId: "the per-conversation session identifier described above.",
  messages:
    "the conversation so far — the messages you typed and the agent's previous replies — so the agent can answer the next question in context. That text is used to produce an answer and to pick a single theme label; the words themselves are never stored.",
};

/** `"5 minutes"` / `"90 seconds"` — formats a window without ever hand-typing its length. */
function formatWindow(seconds: number): string {
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

/** The request's top-level fields, in the order the schema declares them. */
function buildChatRequestFields(): ChatRequestField[] {
  return Object.keys(chatRequestSchema.shape).map((name) => ({
    name,
    purpose: CHAT_REQUEST_FIELD_PURPOSES[name as keyof ChatRequestBody],
  }));
}

function buildSessionIdentifierNote(): SessionIdentifierNote {
  const rateLimitWindowSeconds = readChatRateLimitConfig().session.windowSeconds;
  const storedWithUsageEvents = !ANALYTICS_EVENTS_HAVE_NO_SESSION_FIELD;
  return {
    fieldName: "sessionId" satisfies keyof ChatRequestBody,
    storedWithUsageEvents,
    rateLimitWindowSeconds,
    statements: [
      "Every chat request carries a session identifier: a random UUID your own browser generates the first time you open the chat, kept in that tab's session storage and thrown away when you close the tab.",
      "It is there to group the turns of one conversation — so a single conversation's server log lines can be read together, and so the per-conversation message limit that keeps this demo's costs bounded has something to count against.",
      "It is not an account, a login, or a cookie. Your browser invents it at random: it is not derived from you, your device, or your network, it carries no personal data, and it is not linked to any identity here or anywhere else.",
      "It is never written to this site's usage database. A stored usage event has no session field at all — only the surface, tool, outcome, theme and latency-bucket labels listed above — so the retention window below has no session identifier to apply to.",
      `The only places it outlives the request itself are the rate-limiting counter keyed on it, which expires with the rate-limit window (${formatWindow(rateLimitWindowSeconds)}), and this site's ordinary server request logs, which the hosting platform keeps on its own retention schedule and which are never exported anywhere else.`,
    ],
  };
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
  /** Every top-level field a `POST /api/chat` body carries — derived from the live schema. */
  chatRequestFields: ChatRequestField[];
  /** The session identifier the chat endpoint requires (issue 239). */
  sessionIdentifier: SessionIdentifierNote;
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
      "Identities, accounts, logins, or user agents — nothing that ties a request to a person.",
      "Third-party advertising or tracking cookies of any kind.",
    ],
    chatRequestFields: buildChatRequestFields(),
    sessionIdentifier: buildSessionIdentifierNote(),
    thirdPartyServices: [
      { name: "Vercel", purpose: "hosting this site, and Vercel Analytics for page-level traffic" },
      { name: "Google Gemini", purpose: "processing chat questions and generating embeddings" },
      { name: "Neon", purpose: "the Postgres database usage events and career data are stored in" },
      {
        name: "Upstash",
        purpose:
          "rate limiting requests to the chat and MCP endpoints — the chat's per-conversation counter is keyed on the session identifier described above",
      },
    ],
    noTrackingCookiesStatement:
      "No third-party advertising or tracking cookies are set anywhere on this site.",
  };
}
