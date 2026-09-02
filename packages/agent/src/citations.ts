/**
 * Shared citation marker format for the interview agent's answers.
 *
 * The system prompt (see `./prompt/`) requires every factual sentence about
 * the candidate's experience to carry an inline marker pointing back at the
 * tool result that supports it. This module is the **single, exported**
 * definition of that marker's shape — the chat UI (#70, which turns a
 * marker into an inline link to a site section) and the groundedness evals
 * (#72, which parse markers out of a transcript to score citation coverage)
 * both import `parseCitations`/`serializeCitation` from here rather than
 * re-encoding the format.
 *
 * ## Format
 *
 * `[cite:<entityType>:<entityId>]`, or `[cite:<entityType>:<entityId>#<fragment>]`
 * when the claim is anchored to a sub-part of the entry (e.g. one highlight
 * out of several on an experience entry).
 *
 * `entityType`/`entityId` deliberately mirror this repo's existing
 * `Citation` schema (`packages/career-data/src/schemas/citation.ts`:
 * `entityType` + `entityId` + optional `fragment`) so a parsed marker maps
 * onto a domain-tool result without any translation step — the values a
 * marker carries are exactly the ones a tool result already returns. This
 * module intentionally does not import that schema/package: it declares its
 * own `CitableEntityType` literal union with the same members, so this
 * package's tests stay hermetic and don't require `@hire-me-mcp/career-data`
 * to be built first.
 *
 * ## Why inline markers, not a trailing footnote list
 *
 * The agent's answer is streamed token by token. An inline marker lets a
 * consumer (chat UI or eval scorer) resolve a citation the moment the
 * sentence it supports has finished streaming. A trailing footnote list
 * (`[1]`, `[2]`, ... with sources appended at the end) would force any
 * consumer to wait for the full response before a single citation could be
 * resolved, and would separate a claim from its support by an
 * arbitrary distance — bad for both a streaming UI and a scorer that wants
 * to attribute a specific sentence to a specific tool result.
 */

/** The entity types a citation marker may point at. Mirrors the career-data schema's enum. */
export type CitableEntityType =
  | "profile"
  | "experience"
  | "project"
  | "skill"
  | "gap"
  | "education"
  | "writing"
  | "recommendation"
  | "story";

/**
 * Every {@link CitableEntityType}, as a runtime value.
 *
 * Exported (issue 227) so a consumer that has to map EVERY citable type onto
 * something of its own — the chat UI's marker -> site-section href
 * resolution, for one — can iterate the real set in a test instead of
 * hand-maintaining a duplicate list. That duplicate list is exactly how
 * issue 227 happened: the chat surface silently dropped `profile`,
 * `education` and `recommendation` markers on the belief they were "never
 * emitted", while `get-profile`, `list-education` and `list-recommendations`
 * emit them on most answers.
 */
export const CITABLE_ENTITY_TYPES: readonly CitableEntityType[] = [
  "profile",
  "experience",
  "project",
  "skill",
  "gap",
  "education",
  "writing",
  "recommendation",
  "story",
];

/** A single parsed (or to-be-serialized) citation marker. */
export interface CitationMarker {
  entityType: CitableEntityType;
  entityId: string;
  fragment?: string;
}

const ENTITY_ID_SOURCE = "[a-z0-9]+(?:-[a-z0-9]+)*";
const FRAGMENT_SOURCE = "[A-Za-z0-9_.-]+";
const ENTITY_TYPE_SOURCE = CITABLE_ENTITY_TYPES.join("|");
const MARKER_BODY_SOURCE = `cite:(${ENTITY_TYPE_SOURCE}):(${ENTITY_ID_SOURCE})(?:#(${FRAGMENT_SOURCE}))?`;

/**
 * Matches anything *marker-shaped* — `[cite:` … `]` with no line break and
 * no nested `]` — regardless of whether its entity type is citable.
 *
 * This is deliberately looser than {@link MARKER_BODY_SOURCE}: issue 270
 * showed the model writing `[cite:get-skill-evidence:rust]`, i.e. a marker
 * whose "entity type" is a TOOL NAME. The strict pattern cannot match that,
 * so before this existed such a marker was not a citation and not an error
 * either — it was ordinary prose, and it reached the reader as raw machine
 * syntax. A consumer needs to be able to see "this looked like a marker and
 * did not resolve" to handle it deliberately, which is what
 * {@link parseCitationSpans} exposes.
 *
 * The length bound keeps a stray `[cite:` in free text from scanning to the
 * end of a long answer.
 */
const MARKER_SHAPED_SOURCE = "\\[cite:[^\\]\\n]{1,256}\\]";

/** Matches every marker-shaped substring (valid or not) — used by {@link parseCitationSpans}. */
function createGlobalMarkerShapedRegex(): RegExp {
  return new RegExp(MARKER_SHAPED_SOURCE, "g");
}

/** Matches a string that is *exactly* one marker, start to end (used by {@link parseCitationMarker}). */
function createExactMarkerRegex(): RegExp {
  return new RegExp(`^\\[${MARKER_BODY_SOURCE}\\]$`);
}

function isCitableEntityType(value: string): value is CitableEntityType {
  return (CITABLE_ENTITY_TYPES as readonly string[]).includes(value);
}

function toCitationMarker(
  entityType: string,
  entityId: string,
  fragment: string | undefined,
): CitationMarker | null {
  if (!isCitableEntityType(entityType)) {
    return null;
  }
  return fragment ? { entityType, entityId, fragment } : { entityType, entityId };
}

/** Serialize a {@link CitationMarker} into its `[cite:...]` text form. */
export function serializeCitation(marker: CitationMarker): string {
  const fragmentSuffix = marker.fragment ? `#${marker.fragment}` : "";
  return `[cite:${marker.entityType}:${marker.entityId}${fragmentSuffix}]`;
}

/**
 * Parse a string that should contain *exactly one* marker and nothing else.
 * Returns `null` — never throws — for malformed or non-marker input.
 */
export function parseCitationMarker(input: string): CitationMarker | null {
  const match = createExactMarkerRegex().exec(input.trim());
  if (!match) {
    return null;
  }
  const [, entityType, entityId, fragment] = match;
  return toCitationMarker(entityType ?? "", entityId ?? "", fragment);
}

/**
 * One marker-shaped substring found in free-form text, together with what it
 * parsed to.
 *
 * `marker === null` means "this is machine syntax that is not a citation" —
 * the issue 270 case (`[cite:get-skill-evidence:rust]`, a tool name where an
 * entity type belongs). A renderer must handle that case explicitly rather
 * than letting it fall through as prose.
 */
export interface CitationSpan {
  /** Offset of {@link text} in the scanned string. */
  offset: number;
  /** The literal substring, e.g. `[cite:gap:rust]`. */
  text: string;
  /** The parsed marker, or `null` when the substring is marker-shaped but not a valid citation. */
  marker: CitationMarker | null;
}

/**
 * Scan free-form text (e.g. a full streamed answer) and return every
 * marker-shaped substring it contains, in order of appearance, each with its
 * parsed {@link CitationMarker} or `null` when it does not name a
 * {@link CitableEntityType}.
 *
 * Never throws. Text that merely *contains* a bracket is not marker-shaped
 * and is not reported at all.
 */
export function parseCitationSpans(text: string): CitationSpan[] {
  const spans: CitationSpan[] = [];
  for (const match of text.matchAll(createGlobalMarkerShapedRegex())) {
    const found = match[0];
    spans.push({
      offset: match.index ?? 0,
      text: found,
      marker: parseCitationMarker(found),
    });
  }
  return spans;
}

/**
 * Scan free-form text (e.g. a full streamed answer) and extract every
 * well-formed marker it contains, in order of appearance. Malformed
 * bracket-like substrings are silently skipped, never thrown on — use
 * {@link parseCitationSpans} when you need to *see* those instead.
 */
export function parseCitations(text: string): CitationMarker[] {
  const results: CitationMarker[] = [];
  for (const span of parseCitationSpans(text)) {
    if (span.marker) {
      results.push(span.marker);
    }
  }
  return results;
}
