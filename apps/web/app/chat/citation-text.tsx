/**
 * Renders a streamed assistant message's text with inline `[cite:...]`
 * markers turned into links to the matching site section (#70).
 *
 * Uses `parseCitations`/`serializeCitation` from
 * `@hire-me-mcp/agent/citations` — the single shared definition of the
 * marker format (#65) — to find markers and split the surrounding text
 * around them. It deliberately does not write its own marker regex:
 * `parseCitations` finds every well-formed marker (in order), and
 * re-serializing each one with `serializeCitation` gives back the exact
 * literal substring to split on via `String#indexOf`, so locating a
 * marker's position in the text never re-derives the format.
 *
 * Imported from the package's `./citations` subpath, not its default `.`
 * export: the default export re-exports the full embedded Mastra agent
 * runtime (`getInterviewAgent`, `@mastra/core`, model providers — all
 * Node-only), which breaks a Next.js client-component build if reached
 * from this client-rendered component. `citations.ts` is framework-free
 * and hermetic on its own (see that module's doc comment), so
 * `packages/agent` exposes it as its own subpath for exactly this
 * client-safe reuse — see `packages/agent/package.json`'s `exports` map.
 *
 * A marker that `resolveChatCitationHref` can't map to a known site
 * section (e.g. a `profile`/`education` citation) degrades to plain text —
 * no broken link is ever rendered.
 */

import { parseCitations, serializeCitation } from "@hire-me-mcp/agent/citations";
import { Fragment, type ReactNode } from "react";
import type { WritingEntry } from "../../src/lib/content";
import { Link } from "../design-system/primitives/link";
import { resolveChatCitationHref } from "./resolve-chat-citation-href";

export interface CitationTextProps {
  text: string;
  writingEntries: readonly WritingEntry[];
}

/** Splits `text` into an ordered list of plain-text and citation-link nodes. */
function renderSegments(text: string, writingEntries: readonly WritingEntry[]): ReactNode[] {
  const markers = parseCitations(text);
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const marker of markers) {
    const markerText = serializeCitation(marker);
    const markerIndex = text.indexOf(markerText, cursor);
    if (markerIndex === -1) {
      // Marker was already consumed (e.g. a duplicate marker earlier in the
      // string) — skip rather than mis-split.
      continue;
    }

    const before = text.slice(cursor, markerIndex);
    if (before) {
      // Keyed by its start offset in `text` — stable for a given message,
      // not the loop position (which would shift if an earlier marker were
      // skipped above).
      nodes.push(<Fragment key={`text-${cursor}`}>{before}</Fragment>);
    }

    const href = resolveChatCitationHref(marker, writingEntries);
    if (href) {
      nodes.push(
        <Link key={`citation-${markerIndex}`} href={href}>
          {markerText}
        </Link>,
      );
    }
    // Unresolvable citation (e.g. `profile`/`education`, never emitted by
    // the agent's tool set today): the marker is simply dropped from the
    // rendered text rather than shown as a broken link or raw
    // `[cite:...]` syntax — the surrounding prose still reads cleanly.

    cursor = markerIndex + markerText.length;
  }

  const rest = text.slice(cursor);
  if (rest) {
    nodes.push(<Fragment key="text-end">{rest}</Fragment>);
  }

  return nodes;
}

export function CitationText({ text, writingEntries }: CitationTextProps) {
  return <>{renderSegments(text, writingEntries)}</>;
}
