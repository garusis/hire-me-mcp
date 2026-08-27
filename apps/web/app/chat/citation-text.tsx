/**
 * Renders a streamed assistant message's text with inline `[cite:...]`
 * markers turned into numbered superscript links to the source record
 * (#70, reworked for issue 227), its Markdown rendered (issue 272), plus the
 * matching per-message "Sources" list.
 *
 * The parsing, numbering, labelling and whitespace rules all live in
 * `chat-citation-sources.ts` — see that module for why a marker becomes a
 * number rather than the literal `[cite:experience:house-numbers]` string
 * this used to print into the sentence, why the space around a marker is
 * always eaten (issues 227 and 277), and why marker-shaped text that does
 * not resolve leaves the prose entirely (issue 270). That module builds on
 * `parseCitationSpans`/`serializeCitation` from `@hire-me-mcp/agent/citations`,
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
 * The Markdown half is `chat-markdown.ts`'s typed block tree, mapped here
 * onto a fixed set of React elements. Nothing on this path ever produces an
 * HTML string, so there is no `dangerouslySetInnerHTML` and no way for an
 * answer to introduce an attribute, a URL or a script — see that module's
 * doc comment for the full safety argument.
 *
 * Each superscript carries `data-citation` with the original marker text.
 * That's what the preview e2e specs read to check citation coverage now
 * that the marker syntax no longer appears in the rendered prose, and it
 * keeps the DOM self-describing without showing machine syntax to a reader.
 * A marker that did NOT resolve leaves the same kind of trace —
 * `data-unresolved-citation` on a hidden span — so a broken citation is
 * still loud in the DOM and in tests while being invisible to the reader.
 */

import { Fragment, type ReactNode } from "react";
import type { WritingEntry } from "../../src/lib/content";
import { Link } from "../design-system/primitives/link";
import { buildCitedAnswer } from "./chat-citation-sources";
import { buildChatBlocks, type ChatBlock, type ChatInline } from "./chat-markdown";
import styles from "./citation-text.module.css";

export interface CitationTextProps {
  text: string;
  writingEntries: readonly WritingEntry[];
}

function renderInline(node: ChatInline, position: number): ReactNode {
  switch (node.kind) {
    case "text":
      return <Fragment key={`text-${position}`}>{node.text}</Fragment>;
    case "strong":
      return <strong key={`strong-${position}`}>{node.children.map(renderInline)}</strong>;
    case "emphasis":
      return <em key={`em-${position}`}>{node.children.map(renderInline)}</em>;
    case "code":
      return <code key={`code-${position}`}>{node.text}</code>;
    case "unresolved":
      // Never visible: `hidden` keeps it out of the reader's view and out of
      // `innerText`, while the attribute keeps the failure findable (issue 270).
      return (
        <span
          key={`unresolved-${node.offset}`}
          hidden
          data-unresolved-citation={node.marker}
          aria-hidden="true"
        />
      );
    default: {
      const { source } = node;
      return (
        <sup key={`citation-${node.offset}`} className={styles.marker}>
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
  }
}

function renderBlock(block: ChatBlock, position: number): ReactNode {
  if (block.kind === "paragraph") {
    return (
      <p key={`paragraph-${position}`} className={styles.paragraph}>
        {block.children.map(renderInline)}
      </p>
    );
  }
  const items = block.items.map((item, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: list items have no id of their own and are only ever re-ordered by re-streaming the whole answer.
    <li key={`item-${index}`}>{item.map(renderInline)}</li>
  ));
  return block.ordered ? (
    <ol key={`list-${position}`} className={styles.list}>
      {items}
    </ol>
  ) : (
    <ul key={`list-${position}`} className={styles.list}>
      {items}
    </ul>
  );
}

/** The answer's prose — Markdown rendered, each citation marker a numbered superscript link. */
export function CitationText({ text, writingEntries }: CitationTextProps) {
  const { segments } = buildCitedAnswer(text, writingEntries);
  return <>{buildChatBlocks(segments).map(renderBlock)}</>;
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
