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
  | "writing";

const CITABLE_ENTITY_TYPES: readonly CitableEntityType[] = [
  "profile",
  "experience",
  "project",
  "skill",
  "gap",
  "education",
  "writing",
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

/** Matches a marker anywhere inside a larger string (used by {@link parseCitations}). */
function createGlobalMarkerRegex(): RegExp {
  return new RegExp(`\\[${MARKER_BODY_SOURCE}\\]`, "g");
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
 * Scan free-form text (e.g. a full streamed answer) and extract every
 * well-formed marker it contains, in order of appearance. Malformed
 * bracket-like substrings are silently skipped, never thrown on.
 */
export function parseCitations(text: string): CitationMarker[] {
  const results: CitationMarker[] = [];
  for (const match of text.matchAll(createGlobalMarkerRegex())) {
    const [, entityType, entityId, fragment] = match;
    const marker = toCitationMarker(entityType ?? "", entityId ?? "", fragment);
    if (marker) {
      results.push(marker);
    }
  }
  return results;
}
