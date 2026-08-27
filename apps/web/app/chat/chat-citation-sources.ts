/**
 * Turns one assistant answer's raw text into the two things the chat UI
 * renders from it: an ordered list of prose/citation segments, and the
 * numbered source list those citations point at (issue 227).
 *
 * ## Why this exists
 *
 * The agent writes inline `[cite:<entityType>:<entityId>]` markers
 * (`@hire-me-mcp/agent/citations` — the single shared definition of the
 * format, #65). Before issue 227 the chat rendered a resolvable marker as a
 * link whose visible text was the raw marker, and *deleted* an unresolvable
 * one. Both halves were wrong in practice:
 *
 * - `profile`, `education` and `recommendation` markers — which the real
 *   tool set emits constantly — were all "unresolvable", so a typical
 *   answer showed no citation at all;
 * - deleting the marker left the space in front of it behind, producing the
 *   reported `"…open to new opportunities ."` artifact — a citation failing
 *   invisibly, mid-sentence, with only a typographic scar to show for it;
 * - and the raw `[cite:experience:house-numbers]` string, when it *did*
 *   render, is machine syntax leaking into a sentence a recruiter reads.
 *
 * So: markers become compact numbered references in the prose (rendered as
 * superscript links by `citation-text.tsx`), each one repeated in a
 * per-message "Sources" list with a readable label and the same link. Two
 * markers pointing at the same record share one number — the source list is
 * a list of *sources*, not of mentions.
 *
 * ## Whitespace
 *
 * Horizontal whitespace immediately before a rendered reference is dropped,
 * so the reference hugs the word it supports (`opportunities¹.`). Newlines
 * are left alone — the bubble renders `white-space: pre-wrap`, so eating
 * them would silently reflow the agent's paragraphs. A marker that can't be
 * mapped at all is left in the text verbatim, spacing included: nothing is
 * ever deleted from an answer, because a silent deletion is the failure
 * mode issue 227 was made of.
 */

import type { CitableEntityType, CitationMarker } from "@hire-me-mcp/agent/citations";
import { parseCitations, serializeCitation } from "@hire-me-mcp/agent/citations";
import type { WritingEntry } from "../../src/lib/content";
import { resolveChatCitationHref } from "./resolve-chat-citation-href";

/** One entry in a message's "Sources" list — a record the answer leaned on. */
export interface ChatCitationSource {
  /** 1-based reference number, in order of first appearance in the answer. */
  index: number;
  /** The literal marker text this source was first parsed from, e.g. `[cite:project:cowork]`. Kept for tests and for `data-citation`, never shown to a reader. */
  marker: string;
  /** Where the reader can go to check the claim. */
  href: string;
  /** Human-readable pointer at the record, e.g. `Experience · House Numbers`. */
  label: string;
}

/** A run of the answer's own prose. */
export interface CitedTextSegment {
  kind: "text";
  text: string;
}

/** An inline reference to a {@link ChatCitationSource}. */
export interface CitedCitationSegment {
  kind: "citation";
  source: ChatCitationSource;
  /** Offset of the marker in the original text — a stable React key for a given message. */
  offset: number;
}

export type CitedSegment = CitedTextSegment | CitedCitationSegment;

export interface CitedAnswer {
  segments: CitedSegment[];
  /** Every distinct source, in first-appearance order — `sources[i].index === i + 1`. */
  sources: ChatCitationSource[];
}

/**
 * Reader-facing name for each citable entity type. Generic UI vocabulary,
 * not career content — the record's own identity comes from its id (or, for
 * writing, the entry's real title).
 */
const ENTITY_TYPE_LABELS: Record<CitableEntityType, string> = {
  profile: "Profile",
  experience: "Experience",
  project: "Project",
  skill: "Skill",
  gap: "Not claimed",
  education: "Education",
  writing: "Writing",
  recommendation: "Recommendation",
};

/** `house-numbers-2022-role` -> `House Numbers 2022 Role`. Pure reformatting of the id — never invents a name the dataset doesn't have. */
function humanizeEntityId(entityId: string): string {
  return entityId
    .split("-")
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function buildLabel(
  entityType: CitableEntityType,
  entityId: string,
  writingEntries: readonly WritingEntry[],
): string {
  const typeLabel = ENTITY_TYPE_LABELS[entityType] ?? "Source";
  // A writing entry has a real, authored title — prefer it to the id.
  const entryTitle =
    entityType === "writing"
      ? writingEntries.find((candidate) => candidate.id === entityId)?.title
      : undefined;
  return `${typeLabel} · ${entryTitle ?? humanizeEntityId(entityId)}`;
}

/** Drops trailing spaces/tabs (never newlines — see the module doc) so a reference hugs its word. */
function trimHorizontalEnd(text: string): string {
  return text.replace(/[ \t]+$/u, "");
}

function pushText(segments: CitedSegment[], text: string): void {
  if (text.length > 0) {
    segments.push({ kind: "text", text });
  }
}

/** How a parsed marker is turned into an href — see {@link buildCitedAnswer}'s `resolveHref` parameter. */
export type CitationHrefResolver = (
  marker: CitationMarker,
  writingEntries: readonly WritingEntry[],
) => string | undefined;

/**
 * Splits `text` into renderable segments and collects its distinct sources.
 * Never throws: text with no markers comes back as a single text segment
 * and an empty source list.
 *
 * `resolveHref` defaults to the real resolver and exists as a seam for the
 * one branch below that production code cannot reach: every member of
 * `CitableEntityType` maps to a site surface today, and `parseCitations`
 * only ever yields those types, so "no href for this marker" is
 * unreachable — but it is the exact failure mode issue 227 was made of, so
 * it is kept, and kept genuinely tested rather than asserted vacuously.
 */
export function buildCitedAnswer(
  text: string,
  writingEntries: readonly WritingEntry[],
  resolveHref: CitationHrefResolver = resolveChatCitationHref,
): CitedAnswer {
  const segments: CitedSegment[] = [];
  const sources: ChatCitationSource[] = [];
  const sourcesByHref = new Map<string, ChatCitationSource>();
  let cursor = 0;

  for (const marker of parseCitations(text)) {
    const markerText = serializeCitation(marker);
    const markerIndex = text.indexOf(markerText, cursor);
    if (markerIndex === -1) {
      // Already consumed (a duplicate marker matched earlier) — skip rather
      // than mis-split the surrounding prose.
      continue;
    }

    const before = text.slice(cursor, markerIndex);
    cursor = markerIndex + markerText.length;

    const href = resolveHref(marker, writingEntries);
    if (href === undefined) {
      // No site surface for this entity type at all — only reachable if the
      // shared marker format grows a type this app hasn't mapped yet. The
      // marker stays in the text verbatim rather than being deleted: a
      // silent drop is what produced issue 227's invisible failure, and a
      // visible oddity is easier to notice and fix than a missing citation.
      // Whitespace is left alone here so the marker keeps its own spacing.
      pushText(segments, before);
      pushText(segments, markerText);
      continue;
    }

    // Whitespace in front of a rendered reference belongs to the reference,
    // not the prose: eating it is what stops both `"opportunities ¹."` and
    // issue 227's `"opportunities ."`.
    pushText(segments, trimHorizontalEnd(before));

    const existing = sourcesByHref.get(href);
    const source =
      existing ??
      ({
        index: sources.length + 1,
        marker: markerText,
        href,
        label: buildLabel(marker.entityType, marker.entityId, writingEntries),
      } satisfies ChatCitationSource);
    if (existing === undefined) {
      sourcesByHref.set(href, source);
      sources.push(source);
    }

    segments.push({ kind: "citation", source, offset: markerIndex });
  }

  pushText(segments, text.slice(cursor));

  return { segments, sources };
}
