/**
 * Pure text utilities for the career-data chunker (#21): whitespace
 * normalization, a token estimator, and a paragraph/sentence-aware,
 * token-budgeted splitter with overlap.
 *
 * Nothing here touches the filesystem, network, or `process.env` — inputs
 * are plain strings, outputs are plain strings/numbers, so callers (and
 * their tests) never need I/O to exercise this module.
 */

/**
 * Characters-per-token used to convert a token budget into a character
 * budget. `4` is the commonly cited average for English prose tokenized by
 * BPE-family tokenizers (e.g. OpenAI's `tiktoken` cl100k_base) — it is a
 * deliberately simple, dependency-free estimate, not an exact count for any
 * specific embedding model's tokenizer. Because ingestion (#24) is
 * responsible for the *real* token count fed to the embedding model, this
 * estimator only needs to keep chunks in a sane, roughly-comparable size
 * band — it does not need to be exact.
 */
export const CHARS_PER_TOKEN = 4;

/** Default max chunk size, in estimated tokens. See {@link estimateTokens}. */
export const DEFAULT_MAX_TOKENS = 320;

/**
 * Default overlap between consecutive long-prose chunks, in estimated
 * tokens (~15% of {@link DEFAULT_MAX_TOKENS}) — enough that a claim split
 * across a chunk boundary still appears in full in at least one chunk,
 * without ballooning the number of chunks per document.
 */
export const DEFAULT_OVERLAP_TOKENS = 48;

/** Estimates a token count for `text` using the {@link CHARS_PER_TOKEN} heuristic. */
export function estimateTokens(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Normalizes text before it is split, stored, or hashed:
 * - CRLF/CR line endings become `\n`.
 * - Trailing horizontal whitespace on each line is stripped.
 * - Runs of horizontal whitespace (spaces/tabs) collapse to a single space.
 * - Runs of 3+ blank lines collapse to exactly one blank line (a single
 *   paragraph break).
 * - Leading/trailing whitespace on the whole string is trimmed.
 *
 * Applied uniformly before hashing (see `./hash.ts`) and before splitting,
 * so a whitespace-only edit to a source record (trailing spaces, an extra
 * blank line, tabs vs. spaces) never changes a chunk's stored text or its
 * `contentHash` — this is what makes the ingestion pipeline's "skip
 * unchanged chunks" optimization (#24) safe against cosmetic diffs.
 */
export function normalizeText(text: string): string {
  const unifiedLineEndings = text.replace(/\r\n?/g, "\n");
  const collapsedHorizontalWhitespace = unifiedLineEndings
    .split("\n")
    .map((line) =>
      line
        .replace(/[ \t]+/g, " ")
        .replace(/[ \t]+$/, "")
        .trimStart(),
    )
    .join("\n");
  const collapsedBlankLines = collapsedHorizontalWhitespace.replace(/\n{3,}/g, "\n\n");
  return collapsedBlankLines.trim();
}

/** Splits normalized text into paragraphs on blank-line boundaries. */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

const BULLET_LINE = /^[-*]\s+/;

/** Whether `paragraph` contains at least one Markdown-style bullet line. */
function isBulletParagraph(paragraph: string): boolean {
  return paragraph.split("\n").some((line) => BULLET_LINE.test(line.trim()));
}

/** Splits a non-bullet paragraph into sentences on `.`/`!`/`?` + whitespace boundaries. */
function splitSentences(paragraph: string): string[] {
  const sentences = paragraph.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/);
  return sentences.map((sentence) => sentence.trim()).filter((sentence) => sentence.length > 0);
}

/** One splittable unit of text plus the separator to place before it when reassembling. */
interface Unit {
  text: string;
  /** Separator to place before this unit; ignored for the very first unit in the output. */
  sep: "\n\n" | "\n" | " ";
}

/** Greedily hard-splits an oversized single unit (no natural boundary) into `maxChars`-sized pieces on word boundaries. */
function hardSplit(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) {
    return [text];
  }
  const pieces: string[] = [];
  let rest = text;
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf(" ", maxChars);
    if (cut <= 0) {
      cut = maxChars;
    }
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest.length > 0) {
    pieces.push(rest);
  }
  return pieces;
}

/** Splits a paragraph into its lines (bullet mode) or sentences (prose mode). */
function toLines(paragraph: string): string[] {
  if (!isBulletParagraph(paragraph)) {
    return splitSentences(paragraph);
  }
  return paragraph
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Separator to place before one hard-split piece of one line within one
 * paragraph. `interLineSep` is `"\n"` between bullet lines (preserves the
 * list layout) or `" "` between sentences of ordinary prose — the two
 * "same paragraph, next line" cases `toLines` can produce.
 */
function separatorFor(
  lineIndex: number,
  pieceIndex: number,
  interLineSep: "\n" | " ",
): Unit["sep"] {
  const isFirstOfParagraph = lineIndex === 0 && pieceIndex === 0;
  if (isFirstOfParagraph) {
    // A new paragraph break — irrelevant when this is also the very first
    // unit overall (the caller skips any separator for an empty `current`).
    return "\n\n";
  }
  return pieceIndex > 0 ? " " : interLineSep;
}

/** Flattens one paragraph into its constituent units (see {@link toUnits}). */
function paragraphToUnits(paragraph: string, maxChars: number): Unit[] {
  const units: Unit[] = [];
  const interLineSep: "\n" | " " = isBulletParagraph(paragraph) ? "\n" : " ";
  const lines = toLines(paragraph);
  for (const [lineIndex, line] of lines.entries()) {
    const pieces = hardSplit(line, maxChars);
    for (const [pieceIndex, piece] of pieces.entries()) {
      units.push({
        text: piece,
        sep: separatorFor(lineIndex, pieceIndex, interLineSep),
      });
    }
  }
  return units;
}

/** Flattens normalized text into paragraph/sentence/bullet-line units, splitting any oversized unit further. */
function toUnits(text: string, maxChars: number): Unit[] {
  const paragraphs = splitParagraphs(text);
  const units: Unit[] = [];
  for (const paragraph of paragraphs) {
    units.push(...paragraphToUnits(paragraph, maxChars));
  }
  return units;
}

/** Takes the last `overlapChars` of `text`, trimmed back to the nearest word boundary. */
function takeOverlapTail(text: string, overlapChars: number): string {
  if (overlapChars <= 0 || text.length === 0) {
    return "";
  }
  if (text.length <= overlapChars) {
    return text;
  }
  const rawTail = text.slice(text.length - overlapChars);
  const spaceIndex = rawTail.indexOf(" ");
  const tail = spaceIndex === -1 ? rawTail : rawTail.slice(spaceIndex + 1);
  return tail.trim();
}

/**
 * Splits `text` (already {@link normalizeText}-normalized) into a list of
 * chunk strings, each at most `maxTokens` (estimated — see
 * {@link estimateTokens}), splitting on paragraph and sentence/bullet-line
 * boundaries and never mid-word (except for a single unit so long it alone
 * exceeds the budget, hard-split as a last resort).
 *
 * Every chunk after the first is seeded with the trailing `overlapTokens`
 * (estimated) of the previous chunk, so a claim spanning a chunk boundary
 * still reads in full inside at least one chunk. If including the overlap
 * would itself push a chunk over `maxTokens`, the overlap is dropped for
 * that boundary rather than violating the budget — the max-token invariant
 * always wins over the overlap target.
 *
 * Returns `[]` for empty input, and never returns a chunk exceeding
 * `maxTokens` when a single unit (paragraph/sentence/bullet line) does not
 * itself exceed it (see {@link hardSplit} for the fallback when it does).
 */
export function splitLongText(
  text: string,
  maxTokens: number = DEFAULT_MAX_TOKENS,
  overlapTokens: number = DEFAULT_OVERLAP_TOKENS,
): string[] {
  if (text.length === 0) {
    return [];
  }

  const maxChars = maxTokens * CHARS_PER_TOKEN;
  const overlapChars = overlapTokens * CHARS_PER_TOKEN;
  const units = toUnits(text, maxChars);

  const chunks: string[] = [];
  let current = "";

  for (const unit of units) {
    const candidate = current.length === 0 ? unit.text : `${current}${unit.sep}${unit.text}`;
    if (candidate.length > maxChars && current.length > 0) {
      chunks.push(current);
      const tail = takeOverlapTail(current, overlapChars);
      const seeded = tail.length > 0 ? `${tail} ${unit.text}` : unit.text;
      current = seeded.length > maxChars ? unit.text : seeded;
    } else {
      current = candidate;
    }
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}
