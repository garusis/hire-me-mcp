/**
 * Annotates every citation a tool returns with the exact marker string the
 * model is supposed to write for it (issue 270).
 *
 * ## Why
 *
 * The system prompt used to ask the model to *compose* a marker out of two
 * fields it had to locate inside the tool result: "use the entityType and
 * entityId exactly as they appear as one pair in that tool result's own
 * citations list". Composition is where it went wrong. Asked about a skill
 * the candidate does not claim, a free-tier model answered:
 *
 * ```text
 * He doesn't have production Rust experience [cite:get-skill-evidence:rust]
 * ```
 *
 * — the TOOL's name in the entity-type slot. That is not a citable entity
 * type, so nothing downstream matched it: the chat's parser skipped it, no
 * source was collected, and the raw marker survived into the sentence a
 * recruiter reads.
 *
 * The fix is to stop asking for composition. Each citation now ships with a
 * ready-made `marker` field holding its literal `[cite:<entityType>:<entityId>]`
 * text, and the prompt (`../prompt/sections.ts`) tells the model to copy that
 * string verbatim. Copying a provided literal is a far more reliable
 * operation for a small model than assembling one from two fields of a
 * nested JSON object, and it removes the tool's own name — the string the
 * model demonstrably reached for — from the set of plausible guesses.
 *
 * The marker is derived from the citation through {@link serializeCitation},
 * the single shared definition of the format (`../citations.ts`), so it can
 * never drift from what the parser on the other end accepts.
 *
 * Nothing else about a `DomainResult` changes: `data` is passed through
 * untouched, and each citation keeps every field it already had, so the
 * evals' `extractCitationsFromToolResults` and the MCP surface's own
 * consumers are unaffected.
 */

import type { Citation, DomainResult } from "@hire-me-mcp/core";
import type { CitableEntityType } from "../citations.js";
import { serializeCitation } from "../citations.js";

/** A {@link Citation} plus the literal marker text an answer should carry for it. */
export interface MarkedCitation extends Citation {
  /** Copy-me-verbatim marker text, e.g. `[cite:gap:rust]`. Always consistent with the sibling fields. */
  marker: string;
}

/** A {@link DomainResult} whose citations each carry their {@link MarkedCitation.marker}. */
export interface MarkedDomainResult<T> {
  data: T;
  citations: MarkedCitation[];
}

/** Adds the `marker` field to one citation. Pure; never mutates its input. */
export function markCitation(citation: Citation): MarkedCitation {
  const marker = serializeCitation({
    entityType: citation.entityType as CitableEntityType,
    entityId: citation.entityId,
    ...(citation.fragment === undefined ? {} : { fragment: citation.fragment }),
  });
  return { ...citation, marker };
}

/** Adds the `marker` field to every citation, preserving order. */
export function markCitations(citations: readonly Citation[]): MarkedCitation[] {
  return citations.map(markCitation);
}

/**
 * Wraps a domain service's result so the model receives copy-ready markers.
 * `data` is returned by reference — this only rebuilds the citations array.
 */
export function withCitationMarkers<T>(result: DomainResult<T>): MarkedDomainResult<T> {
  return { data: result.data, citations: markCitations(result.citations) };
}
