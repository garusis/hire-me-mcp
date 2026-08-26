import type { Metadata } from "next";
import { buildConnectionMetadata } from "../../lib/mcp/connection-metadata";
import { MCP_TOOL_CATALOGUE } from "../../lib/mcp/tool-catalogue";
import { getMcpEndpointUrl } from "../../src/lib/config/site-url";
import { getProfileView } from "../../src/lib/content";
import { buildPageMetadata } from "../../src/lib/seo/page-metadata";
import { Container } from "../design-system/primitives/container";
import { CopyToClipboard } from "../design-system/primitives/copy-to-clipboard";
import { Heading } from "../design-system/primitives/heading";
import { Link } from "../design-system/primitives/link";
import { Prose } from "../design-system/primitives/prose";
import { Section } from "../design-system/primitives/section";
import { getDeepLinksForClient } from "./client-deep-links";
import { buildClientSetups } from "./client-setups";
import { ClientTabs } from "./client-tabs";
import { DemoTranscript } from "./demo-transcript";
import styles from "./page.module.css";

/**
 * Canonical rate-limiting documentation this page links to (#43, #71).
 * Deliberately a link to prose, not a hardcoded number: the limit and the
 * limit-exceeded response are documented once, in `apps/web/README.md`'s
 * "Rate limiting" section (#39), so this page never needs to change (or go
 * stale) if the numbers do.
 */
const RATE_LIMIT_DOC_URL =
  "https://github.com/garusis/hire-me-mcp/blob/main/apps/web/README.md#rate-limiting";

/** Description names the profile and the live tool catalogue, so it changes with either. */
export function generateMetadata(): Metadata {
  const { profile } = getProfileView();
  const toolNames = MCP_TOOL_CATALOGUE.map((tool) => tool.name).join(", ");
  return buildPageMetadata({
    title: "Add me to your AI",
    description: `Connect any MCP-compatible AI assistant directly to ${profile.name}'s real career data: ${toolNames}.`,
    path: "/mcp",
  });
}

/**
 * The "Add me to your AI" MCP section (#43) — what the public MCP endpoint
 * is, its URL (from the single source in `src/lib/config/site-url.ts`, so
 * preview and production deploys each show their own), per-client setup,
 * the live tool catalogue, an honest demo placeholder, and a
 * troubleshooting pointer. A Server Component: nothing here needs
 * client-side state except the tabs (`ClientTabs`) and the copy buttons
 * (`CopyToClipboard`), both already client components of their own.
 */
export default function McpPage() {
  const endpointUrl = getMcpEndpointUrl();
  const clientSetups = buildClientSetups(endpointUrl);
  // issue 250 — the same verified one-click add-connector deep links the home
  // page's connect widget renders, so the "full setup" page is a superset
  // of the teaser that links to it, never a subset.
  const { serverName } = buildConnectionMetadata(endpointUrl);

  return (
    <>
      <Section aria-labelledby="mcp-hero-heading">
        <Container>
          <Heading level={1} id="mcp-hero-heading">
            Add me to your AI
          </Heading>
          <Prose>
            <p>
              This is a live Model Context Protocol (MCP) server — a public, read-only, anonymous
              endpoint that exposes Marcos Alvarez&apos;s real career data (profile, work history,
              projects and skill evidence) as tools any MCP-compatible AI assistant can call
              directly. Connect it once, then ask your assistant about his experience the same way
              you&apos;d ask it to use any other tool — every answer comes back grounded in the same
              data this site is built from, with citations.
            </p>
          </Prose>

          <div className={styles.endpointRow}>
            <code className={styles.endpointUrl}>{endpointUrl}</code>
            <CopyToClipboard value={endpointUrl} label="Copy endpoint URL" />
          </div>
        </Container>
      </Section>

      <Section aria-labelledby="mcp-setup-heading">
        <Container>
          <Heading level={2} id="mcp-setup-heading">
            Connect your client
          </Heading>
          <ClientTabs
            items={clientSetups.map((setup) => {
              const deepLinks = getDeepLinksForClient(setup.id, endpointUrl, serverName);
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
                      <CopyToClipboard
                        value={setup.snippet}
                        label={`Copy ${setup.label} snippet`}
                      />
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
        </Container>
      </Section>

      <Section aria-labelledby="mcp-tools-heading">
        <Container>
          <Heading level={2} id="mcp-tools-heading">
            Available tools
          </Heading>
          <Prose>
            <p>
              Every tool below is read straight from this server&apos;s live registry — if a tool is
              ever added, removed or renamed, this list changes with it.
            </p>
          </Prose>
          <ul className={styles.toolList}>
            {MCP_TOOL_CATALOGUE.map((tool) => (
              <li key={tool.name}>
                <Heading level={3} className={styles.toolName}>
                  {tool.name}
                </Heading>
                <p>{tool.description}</p>
                <p className={styles.examplePrompt}>{tool.examplePrompt}</p>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      <Section aria-labelledby="mcp-demo-heading">
        <Container>
          <Heading level={2} id="mcp-demo-heading">
            See it in action
          </Heading>
          <DemoTranscript />
        </Container>
      </Section>

      <Section aria-labelledby="mcp-troubleshooting-heading">
        <Container>
          <Heading level={2} id="mcp-troubleshooting-heading">
            Troubleshooting and limits
          </Heading>
          <Prose>
            <p>
              This endpoint is public and requires no authentication. If a client can&apos;t
              connect, double check it supports the MCP Streamable HTTP transport and that the URL
              above was copied in full. For current rate-limit behavior, see{" "}
              <Link href={RATE_LIMIT_DOC_URL}>
                the &quot;Rate limiting&quot; section of the app README
              </Link>
              .
            </p>
          </Prose>
        </Container>
      </Section>
    </>
  );
}
