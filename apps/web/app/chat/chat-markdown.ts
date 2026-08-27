/**
 * The small, deliberately incomplete Markdown the chat renders (issue 272).
 *
 * ## Why a subset, written here, instead of a Markdown library
 *
 * The agent answers "walk me through his roles" with a bulleted list, and
 * the bubble used to print that list's syntax literally: `* **Senior
 * Software Engineer at FullStack Labs** (2018 to 2020): …`. The message body
 * was `white-space: pre-wrap` with no renderer in the path.
 *
 * Reaching for a general Markdown renderer would have brought two things
 * this surface does not want:
 *
 * - **An HTML sink.** Every mainstream renderer's happy path ends in
 *   `dangerouslySetInnerHTML`, which turns "render the model's answer" into
 *   "execute a string the model produced". This module never produces HTML.
 *   It produces a typed tree that `citation-text.tsx` maps onto React
 *   elements, so the model's text can only ever become *text nodes* and the
 *   fixed set of elements below (`p`, `ul`/`ol`/`li`, `strong`, `em`,
 *   `code`). There is no path from an answer to an attribute, an event
 *   handler, a `<script>`, or a `style` — so nothing here can violate the
 *   CSP contract from issues 181/206 either, because nothing here emits inline
 *   script or style at all.
 * - **Links and images.** Both carry a URL the model would control, which is
 *   the one place a `javascript:` payload could enter. So link and image
 *   syntax is deliberately NOT parsed: `[text](url)` stays literal text. The
 *   chat already has a link mechanism whose hrefs the *app* builds —
 *   citations (`resolve-chat-citation-href.ts`) — and that stays the only
 *   way an answer can produce an anchor.
 *
 * Raw HTML in the answer is likewise never parsed: `<b>` arrives here as
 * five characters and leaves as five characters in a text node.
 *
 * ## The subset
 *
 * - `- item` / `* item` / `+ item` — unordered list
 * - `1. item` / `1) item` — ordered list
 * - `**strong**`, `*emphasis*`, `` `code` ``
 * - blank line — paragraph break; a single newline is a soft break kept by
 *   the paragraph's `white-space: pre-wrap`
 *
 * Underscore emphasis (`_x_`, `__x__`) is intentionally absent: technology
 * names in this corpus contain underscores far more often than the agent
 * writes underscore emphasis, and mangling `snake_case_id` into italics is a
 * worse failure than leaving an underscore alone.
 *
 * ## Citations pass through untouched
 *
 * The input is the segment list `buildCitedAnswer` already produced, so a
 * citation reference is an opaque token here — Markdown scanning only ever
 * looks at the prose runs between references. That keeps the numbered
 * superscripts and the Sources block working exactly as before, inside list
 * items as well as paragraphs.
 */

import type { CitedSegment } from "./chat-citation-sources";

/** An inline node inside a paragraph or list item. */
export type ChatInline =
  | { kind: "text"; text: string }
  | { kind: "strong"; children: ChatInline[] }
  | { kind: "emphasis"; children: ChatInline[] }
  | { kind: "code"; text: string }
  | Extract<CitedSegment, { kind: "citation" } | { kind: "unresolved" }>;

/** A block-level node — the top level of a rendered answer. */
export type ChatBlock =
  | { kind: "paragraph"; children: ChatInline[] }
  | { kind: "list"; ordered: boolean; items: ChatInline[][] };

/**
 * Inline syntax, as one alternation so a single left-to-right scan finds the
 * earliest opener. Each alternative captures exactly its content.
 *
 * Emphasis requires a non-space, non-marker character on both ends
 * (`**bold**`, never `** not bold **`), which is also what keeps a bare `*`
 * used as a bullet or as arithmetic from opening a span.
 */
const INLINE_SYNTAX =
  /`([^`\n]+)`|\*\*([^\s*](?:[^\n]*?[^\s*])?)\*\*|\*([^\s*](?:[^\n*]*[^\s*])?)\*/g;

/** One line of the answer: prose split out from the reference tokens sitting on it. */
type LineToken =
  | { kind: "text"; text: string }
  | Extract<ChatInline, { kind: "citation" }>
  | Extract<ChatInline, { kind: "unresolved" }>;

const UNORDERED_ITEM = /^\s{0,3}[-*+][ \t]+/u;
const ORDERED_ITEM = /^\s{0,3}\d{1,9}[.)][ \t]+/u;

function pushInlineText(nodes: ChatInline[], text: string): void {
  if (text.length > 0) {
    nodes.push({ kind: "text", text });
  }
}

function buildInlineNode(match: RegExpExecArray): ChatInline {
  const [, code, strong, emphasis] = match;
  if (code !== undefined) {
    return { kind: "code", text: code };
  }
  if (strong !== undefined) {
    return { kind: "strong", children: parseInlineMarkdown(strong) };
  }
  return { kind: "emphasis", children: parseInlineMarkdown(emphasis ?? "") };
}

/** Parses one prose run's inline Markdown. Never throws; unmatched syntax stays literal text. */
export function parseInlineMarkdown(text: string): ChatInline[] {
  const nodes: ChatInline[] = [];
  const scanner = new RegExp(INLINE_SYNTAX.source, "g");
  let cursor = 0;
  let match = scanner.exec(text);
  while (match !== null) {
    pushInlineText(nodes, text.slice(cursor, match.index));
    nodes.push(buildInlineNode(match));
    cursor = match.index + match[0].length;
    scanner.lastIndex = cursor;
    match = scanner.exec(text);
  }
  pushInlineText(nodes, text.slice(cursor));
  return nodes;
}

/** Splits the segment list into lines, keeping reference tokens on the line they appeared in. */
function toLines(segments: readonly CitedSegment[]): LineToken[][] {
  const lines: LineToken[][] = [[]];
  const current = (): LineToken[] => lines[lines.length - 1] as LineToken[];
  for (const segment of segments) {
    if (segment.kind !== "text") {
      current().push(segment);
      continue;
    }
    const parts = segment.text.split("\n");
    parts.forEach((part, index) => {
      if (index > 0) {
        lines.push([]);
      }
      if (part.length > 0) {
        current().push({ kind: "text", text: part });
      }
    });
  }
  return lines;
}

function lineText(line: readonly LineToken[]): string {
  return line
    .filter((token): token is { kind: "text"; text: string } => token.kind === "text")
    .map((token) => token.text)
    .join("");
}

/** The list marker this line opens, if any — read from its leading prose only. */
function listMarkerOf(
  line: readonly LineToken[],
): { ordered: boolean; prefixLength: number } | null {
  const first = line[0];
  if (first === undefined || first.kind !== "text") {
    return null;
  }
  const unordered = UNORDERED_ITEM.exec(first.text);
  if (unordered) {
    return { ordered: false, prefixLength: unordered[0].length };
  }
  const ordered = ORDERED_ITEM.exec(first.text);
  return ordered ? { ordered: true, prefixLength: ordered[0].length } : null;
}

/** Expands a line's tokens into inline nodes, dropping `prefixLength` leading characters of prose. */
function toInline(line: readonly LineToken[], prefixLength: number): ChatInline[] {
  const nodes: ChatInline[] = [];
  let remainingPrefix = prefixLength;
  for (const token of line) {
    if (token.kind !== "text") {
      nodes.push(token);
      continue;
    }
    const text = remainingPrefix > 0 ? token.text.slice(remainingPrefix) : token.text;
    remainingPrefix = Math.max(0, remainingPrefix - token.text.length);
    nodes.push(...parseInlineMarkdown(text));
  }
  return nodes;
}

/** The block accumulator threaded through one pass over the answer's lines. */
interface BlockState {
  blocks: ChatBlock[];
  /** The paragraph still open for more lines, or `null` after a break. */
  paragraph: ChatInline[] | null;
  /** The list still open for more items, or `null` after a break. */
  list: Extract<ChatBlock, { kind: "list" }> | null;
}

/** Ends whatever block is open, so the next line starts a fresh one. */
function endOpenBlocks(state: BlockState): void {
  state.paragraph = null;
  state.list = null;
}

function appendListItem(
  state: BlockState,
  line: readonly LineToken[],
  ordered: boolean,
  prefixLength: number,
): void {
  state.paragraph = null;
  if (state.list !== null && state.list.ordered !== ordered) {
    state.list = null;
  }
  if (state.list === null) {
    state.list = { kind: "list", ordered, items: [] };
    state.blocks.push(state.list);
  }
  state.list.items.push(toInline(line, prefixLength));
}

function appendParagraphLine(state: BlockState, line: readonly LineToken[]): void {
  state.list = null;
  if (state.paragraph === null) {
    state.paragraph = [];
    state.blocks.push({ kind: "paragraph", children: state.paragraph });
  } else {
    // A single newline inside a paragraph is a soft break, preserved by the
    // paragraph's `white-space: pre-wrap` exactly as it was before issue 272.
    state.paragraph.push({ kind: "text", text: "\n" });
  }
  state.paragraph.push(...toInline(line, 0));
}

/** A line with nothing on it but blank prose — a paragraph break, not content. */
function isBlankLine(line: readonly LineToken[]): boolean {
  return line.every((token) => token.kind === "text") && lineText(line).trim().length === 0;
}

/**
 * Turns one answer's citation segments into the block tree the chat renders.
 * Never throws: prose with no Markdown in it comes back as a single
 * paragraph whose children are exactly the segments that went in.
 */
export function buildChatBlocks(segments: readonly CitedSegment[]): ChatBlock[] {
  const state: BlockState = { blocks: [], paragraph: null, list: null };
  for (const line of toLines(segments)) {
    if (isBlankLine(line)) {
      endOpenBlocks(state);
      continue;
    }
    const marker = listMarkerOf(line);
    if (marker === null) {
      appendParagraphLine(state, line);
      continue;
    }
    appendListItem(state, line, marker.ordered, marker.prefixLength);
  }
  return state.blocks.filter((block) => block.kind !== "paragraph" || block.children.length > 0);
}
