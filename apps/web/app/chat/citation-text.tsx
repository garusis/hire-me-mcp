/**
 * Renders a streamed assistant message's text with inline `[cite:...]`
 * markers turned into numbered superscript links to the source record
 * (#70, reworked for issue 227), plus the matching per-message "Sources"
 * list.
 *
 * The parsing, numbering, labelling and whitespace rules all live in
 * `chat-citation-sources.ts` — see that module for why a marker becomes a
 * number rather than the literal `[cite:experience:house-numbers]` string
 * this used to print into the sentence, and why the space in front of a
 * marker is always eaten. That module builds on
 * `parseCitations`/`serializeCitation` from `@hire-me-mcp/agent/citations`,
 * the single shared definition of the marker format (#65), rather than any
 * regex of its own.
 *
 * Those parsers are imported from the package's `./citations` subpath, not
 * its default `.` export: the default export re-exports the full embedded
 * Mastra agent runtime (`getInterviewAgent`, `@mastra/core`, model
 * providers — all Node-only), which breaks a Next.js client-component build
 * if reached from this client-rendered component. `citations.ts` is
 * framework-free and hermetic on its own (see that module's doc comment),
 * so `packages/agent` exposes it as its own subpath for exactly this
 * client-safe reuse — see `packages/agent/package.json`'s `exports` map.
 *
 * Each superscript carries `data-citation` with the original marker text.
 * That's what the preview e2e specs read to check citation coverage now
 * that the marker syntax no longer appears in the rendered prose, and it
 * keeps the DOM self-describing without showing machine syntax to a reader.
 */

import { Fragment, type ReactNode } from "react";
import type { WritingEntry } from "../../src/lib/content";
import { Link } from "../design-system/primitives/link";
import { buildCitedAnswer, type CitedSegment } from "./chat-citation-sources";
import styles from "./citation-text.module.css";

export interface CitationTextProps {
  text: string;
  writingEntries: readonly WritingEntry[];
}

function renderSegment(segment: CitedSegment, position: number): ReactNode {
  if (segment.kind === "text") {
    return <Fragment key={`text-${position}`}>{segment.text}</Fragment>;
  }
  const { source } = segment;
  return (
    <sup key={`citation-${segment.offset}`} className={styles.marker}>
      <Link
        href={source.href}
        data-citation={source.marker}
        title={source.label}
        aria-label={`Source ${source.index}: ${source.label}`}
      >
        {source.index}
      </Link>
    </sup>
  );
}

/** The answer's prose, with each citation marker rendered as a numbered superscript link. */
export function CitationText({ text, writingEntries }: CitationTextProps) {
  const { segments } = buildCitedAnswer(text, writingEntries);
  return <>{segments.map(renderSegment)}</>;
}

/**
 * The message's "Sources" list — one numbered entry per distinct record the
 * answer cited, matching the superscripts above it. Renders nothing when
 * the answer cited nothing (a clarifying question, an honest "not in the
 * data" reply), so an empty heading never appears.
 */
export function CitationSources({ text, writingEntries }: CitationTextProps) {
  const { sources } = buildCitedAnswer(text, writingEntries);
  if (sources.length === 0) {
    return null;
  }
  return (
    <div className={styles.sources}>
      <p className={styles.sourcesHeading}>Sources</p>
      <ol className={styles.sourcesList}>
        {sources.map((source) => (
          <li key={source.href}>
            <Link href={source.href} data-citation-source={source.marker}>
              {source.label}
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
