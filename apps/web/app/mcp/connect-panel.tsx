import type { ClientSnippet } from "@hire-me-mcp/connect-metadata";
import { cx } from "../design-system/lib/cx";
import { CopyToClipboard } from "../design-system/primitives/copy-to-clipboard";
import { Heading } from "../design-system/primitives/heading";
import { Link } from "../design-system/primitives/link";
import type { DeepLink } from "./client-deep-links";
import { ClientTabs } from "./client-tabs";
import styles from "./connect-panel.module.css";

export interface ConnectPanelProps {
  /** Every client to render a tab for — a plain array, never switched on by id, so a new entry needs no change here (#45). */
  snippets: ClientSnippet[];
  /** At least 3 example prompts (#45's AC), sourced from the connection metadata module by the caller. */
  examplePrompts: string[];
  endpointUrl: string;
  /** Verified add-connector deep links, keyed by `ClientSnippet["id"]`. Absent/empty renders no deep link for that client — the manual snippet is always shown regardless. */
  deepLinksByClientId?: Partial<Record<string, DeepLink[]>>;
  /** Denser spacing/copy for the home-page placement; the full `/mcp` page uses the default. */
  compact?: boolean;
  /** Link to a fuller page (e.g. `/mcp`) for tool catalogue, demo, and troubleshooting — omitted when this *is* that fuller page. */
  detailHref?: string;
  detailLabel?: string;
}

/**
 * The "Connect your agent" panel (#45): a client picker with copy-ready
 * setup snippets, verified add-connector deep links where one exists, and
 * example prompts — the human-facing counterpart to `llms.txt` (#37).
 * Every list here (`snippets`, `examplePrompts`, `deepLinksByClientId`) is a
 * prop, built by the caller from `@hire-me-mcp/connect-metadata`
 * (`buildClientSnippets`) and `client-deep-links.ts` — this component holds
 * no endpoint URL or tool name of its own, so it can't drift from either.
 * Reused, in `compact` form, on the home page (#45) and, at full size, on
 * `/mcp` (#43).
 */
export function ConnectPanel({
  snippets,
  examplePrompts,
  endpointUrl,
  deepLinksByClientId,
  compact = false,
  detailHref,
  detailLabel = "Explore the full setup, tools, and demo",
}: ConnectPanelProps) {
  return (
    <div className={cx(compact && styles.compact)}>
      <div className={styles.endpointRow}>
        <code className={styles.endpointUrl}>{endpointUrl}</code>
        <CopyToClipboard value={endpointUrl} label="Copy endpoint URL" />
      </div>

      <ClientTabs
        items={snippets.map((setup) => {
          const deepLinks = deepLinksByClientId?.[setup.id] ?? [];
          return {
            id: setup.id,
            label: setup.label,
            panel: (
              <div>
                <p className={styles.clientInstructions}>{setup.instructions}</p>
                <div className={styles.snippetRow}>
                  <pre className={styles.snippet}>
                    <code>{setup.snippet}</code>
                  </pre>
                  <CopyToClipboard value={setup.snippet} label={`Copy ${setup.label} snippet`} />
                </div>
                {deepLinks.length > 0 ? (
                  <ul className={styles.deepLinks}>
                    {deepLinks.map((deepLink) => (
                      <li key={deepLink.id}>
                        <a className={styles.deepLink} href={deepLink.href}>
                          {deepLink.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ),
          };
        })}
      />

      {examplePrompts.length > 0 ? (
        <div>
          <Heading level={3}>Try asking</Heading>
          <ul className={styles.examplePrompts}>
            {examplePrompts.map((prompt) => (
              <li key={prompt} className={styles.examplePrompt}>
                {prompt}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {detailHref ? (
        <Link href={detailHref} className={styles.detailLink}>
          {detailLabel}
        </Link>
      ) : null}
    </div>
  );
}
