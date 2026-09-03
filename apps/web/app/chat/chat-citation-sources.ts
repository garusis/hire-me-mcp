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
 * ## Whitespace (issues 227 and 277)
 *
 * Horizontal whitespace immediately before a rendered reference is dropped,
 * so the reference hugs the word it supports (`opportunities¹.`), and
 * horizontal whitespace immediately *after* one is dropped too when the next
 * thing in the sentence is punctuation — that is issue 277's `costs ¹ . He`
 * artifact, which survives whether the model wrote the space or not.
 * Newlines are left alone — a paragraph's text still renders
 * `white-space: pre-wrap`, so eating them would silently reflow the agent's
 * prose.
 *
 * ## Markers that do not resolve (issue 270)
 *
 * This module used to leave an unmappable marker in the prose verbatim, on
 * the reasoning that a silent deletion is what issue 227 was made of. Issue
 * 270 showed the cost of that: the model wrote
 * `[cite:get-skill-evidence:rust]` — a TOOL name in the entity-type slot —
 * and, since `parseCitations` cannot match a non-citable type, the raw
 * machine syntax was not even recognised as a marker. It was prose, and a
 * recruiter read it.
 *
 * So marker-shaped text is now always recognised (`parseCitationSpans`), and
 * one that does not resolve becomes an `unresolved` segment: removed from
 * what the reader sees, with the same whitespace repair as a real reference,
 * but preserved in the DOM as a hidden `data-unresolved-citation` attribute.
 * That keeps the failure loud where it needs to be loud (tests, a browser
 * inspector, the preview e2e suite) and silent where machine syntax has no
 * business appearing. The real fix for 270 is upstream — `packages/agent`
 * hands the model a copy-ready `marker` string per citation — this is the
 * backstop that guarantees a mistake there can never be *read*.
 */

import type { CitableEntityType, CitationMarker } from "@hire-me-mcp/agent/citations";
import { parseCitationSpans } from "@hire-me-mcp/agent/citations";
import type { StoryParentRef, WritingEntry } from "../../src/lib/content";
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

/**
 * Marker-shaped text that is not a citation — issue 270's
 * `[cite:get-skill-evidence:rust]`. Renders nothing a reader can see; the
 * literal text is kept so the DOM can carry it as a hidden attribute.
 */
export interface CitedUnresolvedSegment {
  kind: "unresolved";
  /** The literal marker-shaped substring, e.g. `[cite:get-skill-evidence:rust]`. */
  marker: string;
  /** Offset in the original text — a stable React key for a given message. */
  offset: number;
}

export type CitedSegment = CitedTextSegment | CitedCitationSegment | CitedUnresolvedSegment;

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
  story: "Story",
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

/**
 * Issue 277: drops spaces/tabs that a reference left stranded in front of the
 * sentence's own punctuation, so `costs¹ . He` reads `costs¹. He`. Only
 * punctuation triggers it — a space before the next *word* is real prose
 * spacing and is left alone.
 */
function trimHorizontalStartBeforePunctuation(text: string): string {
  return text.replace(/^[ \t]+(?=[.,;:!?)\]}])/u, "");
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
  storyParents: readonly StoryParentRef[],
) => string | undefined;

/**
 * Splits `text` into renderable segments and collects its distinct sources.
 * Never throws: text with no markers comes back as a single text segment
 * and an empty source list.
 *
 * `storyParents` (issue 295, epic 288) is the story -> primary-experience lookup
 * a `story` marker's href needs — without it, a story citation degrades to
 * the generic `/experience` fallback instead of its own parent role's
 * anchor. Defaults to empty, which is exactly that honest fallback rather
 * than a crash, for any caller that genuinely has no lookup available.
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
  storyParents: readonly StoryParentRef[] = [],
  resolveHref: CitationHrefResolver = resolveChatCitationHref,
): CitedAnswer {
  const segments: CitedSegment[] = [];
  const sources: ChatCitationSource[] = [];
  const sourcesByHref = new Map<string, ChatCitationSource>();
  let cursor = 0;
  // Whether the previous emitted segment was a reference — decides whether
  // the next run of prose gets issue 277's leading-whitespace repair.
  let afterReference = false;

  const takeProse = (until: number): string => {
    const raw = text.slice(cursor, until);
    return trimHorizontalEnd(afterReference ? trimHorizontalStartBeforePunctuation(raw) : raw);
  };

  for (const span of parseCitationSpans(text)) {
    if (span.offset < cursor) {
      // Overlaps something already consumed — skip rather than mis-split the
      // surrounding prose.
      continue;
    }

    // Whitespace in front of a reference belongs to the reference, not the
    // prose: eating it is what stops both `"opportunities ¹."` and issue
    // 227's `"opportunities ."`.
    pushText(segments, takeProse(span.offset));
    cursor = span.offset + span.text.length;

    const href =
      span.marker === null ? undefined : resolveHref(span.marker, writingEntries, storyParents);
    if (span.marker === null || href === undefined) {
      // Either not a citable entity type at all (issue 270's tool-name
      // marker) or a type this app has no site surface for. Neither is
      // something a reader should ever see — it is machine syntax — so it
      // leaves the prose, and `citation-text.tsx` keeps it in the DOM as a
      // hidden attribute so the failure is still findable.
      segments.push({ kind: "unresolved", marker: span.text, offset: span.offset });
      afterReference = true;
      continue;
    }

    const existing = sourcesByHref.get(href);
    const source =
      existing ??
      ({
        index: sources.length + 1,
        marker: span.text,
        href,
        label: buildLabel(span.marker.entityType, span.marker.entityId, writingEntries),
      } satisfies ChatCitationSource);
    if (existing === undefined) {
      sourcesByHref.set(href, source);
      sources.push(source);
    }

    segments.push({ kind: "citation", source, offset: span.offset });
    afterReference = true;
  }

  pushText(segments, takeProse(text.length));

  return { segments, sources };
}
