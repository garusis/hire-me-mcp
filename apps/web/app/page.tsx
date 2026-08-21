import { buildClientSnippets } from "@hire-me-mcp/connect-metadata";
import type { Metadata } from "next";
import { buildConnectionMetadata } from "../lib/mcp/connection-metadata";
import { getMcpEndpointUrl } from "../src/lib/config/site-url";
import {
  type ExperienceListItemView,
  getExperienceListView,
  getProfileView,
  getProjectsListView,
  getSkillsListView,
  type ProjectListItemView,
  type Skill,
} from "../src/lib/content";
import { buildPersonJsonLd } from "../src/lib/seo/json-ld";
import { JsonLdScript } from "../src/lib/seo/json-ld-script";
import { RevealOnScroll } from "./design-system/motion/reveal-on-scroll";
import { Badge } from "./design-system/primitives/badge";
import { Button } from "./design-system/primitives/button";
import { Card } from "./design-system/primitives/card";
import { Container } from "./design-system/primitives/container";
import { Heading } from "./design-system/primitives/heading";
import { Prose } from "./design-system/primitives/prose";
import { Section } from "./design-system/primitives/section";
import { getDeepLinksForClient } from "./mcp/client-deep-links";
import { ConnectPanel } from "./mcp/connect-panel";
import styles from "./page.module.css";

/** Canonical for the home route — title/description fall back to `app/layout.tsx`'s site-wide default, which is already sourced from this same profile view. */
export function generateMetadata(): Metadata {
  return { alternates: { canonical: "/" } };
}

/**
 * How many entries surface in each highlight rail. Generic UI configuration
 * (not career content) — the *selection* itself always follows the content
 * layer's own ordering (reverse-chronological for experience, dataset order
 * for projects, proficiency rank for skills), never a hardcoded id list, so
 * editing `packages/career-data` changes the page with no code change here.
 */
const HIGHLIGHT_EXPERIENCE_COUNT = 3;
const HIGHLIGHT_PROJECT_COUNT = 3;
const HIGHLIGHT_SKILL_COUNT = 8;

const AVAILABILITY_LABEL: Record<"open" | "selective" | "not-looking", string> = {
  open: "Open to new roles",
  selective: "Selectively open",
  "not-looking": "Not currently looking",
};

/** First sentence of a longer paragraph, used as a one-line positioning statement. */
function firstSentence(text: string): string {
  const match = /[^.]+\./.exec(text);
  return match ? match[0].trim() : text.trim();
}

function ExperienceHighlightCard({ item }: { item: ExperienceListItemView }) {
  return (
    <Card as="article" className={styles.highlightCard}>
      <Heading level={4} className={styles.highlightCardTitle}>
        {item.entry.role}, {item.entry.company}
      </Heading>
      <p className={styles.highlightCardBody}>{item.entry.summary}</p>
    </Card>
  );
}

function ProjectHighlightCard({ item }: { item: ProjectListItemView }) {
  return (
    <Card as="article" className={styles.highlightCard}>
      <Heading level={4} className={styles.highlightCardTitle}>
        {item.project.name}
      </Heading>
      <p className={styles.highlightCardBody}>{item.project.summary}</p>
    </Card>
  );
}

function SkillBadge({ skill }: { skill: Skill }) {
  return <Badge>{skill.name}</Badge>;
}

export default function Home() {
  const profileView = getProfileView();
  const { profile } = profileView;
  const experience = getExperienceListView().items.slice(0, HIGHLIGHT_EXPERIENCE_COUNT);
  const projects = getProjectsListView().items.slice(0, HIGHLIGHT_PROJECT_COUNT);
  const allSkills = getSkillsListView().items;
  const skills = allSkills.slice(0, HIGHLIGHT_SKILL_COUNT);
  const [primaryContact] = profile.contacts;

  const endpointUrl = getMcpEndpointUrl();
  const connectionMetadata = buildConnectionMetadata(endpointUrl);
  const clientSnippets = buildClientSnippets(connectionMetadata);
  const deepLinksByClientId = Object.fromEntries(
    clientSnippets.map((snippet) => [
      snippet.id,
      getDeepLinksForClient(snippet.id, endpointUrl, connectionMetadata.serverName),
    ]),
  );

  return (
    <>
      <JsonLdScript data={buildPersonJsonLd(profileView, allSkills)} />

      <Section aria-labelledby="hero-heading">
        <Container>
          <RevealOnScroll>
            <Badge variant="accent">{AVAILABILITY_LABEL[profile.availability]}</Badge>
            <Heading level={1} id="hero-heading" className={styles.heroName}>
              {profile.name}
            </Heading>
            <p className={styles.heroHeadline}>{profile.headline}</p>
            <p className={styles.heroPositioning}>{firstSentence(profile.summary)}</p>
            <div className={styles.heroActions}>
              {primaryContact ? (
                <Button href={primaryContact.url} variant="solid">
                  {primaryContact.label}
                </Button>
              ) : null}
              <Button href="#mcp" variant="outline">
                Add me to your AI
              </Button>
            </div>
          </RevealOnScroll>
        </Container>
      </Section>

      <Section aria-labelledby="bio-heading">
        <Container>
          <RevealOnScroll>
            <Heading level={2} id="bio-heading">
              About
            </Heading>
            <Prose>
              <p>{profile.summary}</p>
            </Prose>
          </RevealOnScroll>
        </Container>
      </Section>

      <Section aria-labelledby="highlights-heading">
        <Container>
          <RevealOnScroll>
            <Heading level={2} id="highlights-heading">
              Highlights
            </Heading>

            {experience.length > 0 ? (
              <div className={styles.highlightGroup}>
                <Heading level={3}>Recent roles</Heading>
                <div className={styles.highlightGrid}>
                  {experience.map((item) => (
                    <ExperienceHighlightCard key={item.slug} item={item} />
                  ))}
                </div>
              </div>
            ) : null}

            {projects.length > 0 ? (
              <div className={styles.highlightGroup}>
                <Heading level={3}>Selected projects</Heading>
                <div className={styles.highlightGrid}>
                  {projects.map((item) => (
                    <ProjectHighlightCard key={item.slug} item={item} />
                  ))}
                </div>
              </div>
            ) : null}

            {skills.length > 0 ? (
              <div className={styles.highlightGroup}>
                <Heading level={3}>Top skills</Heading>
                <ul className={styles.skillList}>
                  {skills.map((skill) => (
                    <li key={skill.id}>
                      <SkillBadge skill={skill} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </RevealOnScroll>
        </Container>
      </Section>

      <Section id="mcp" aria-labelledby="mcp-heading" className={styles.mcpTeaser}>
        <Container>
          <RevealOnScroll>
            <Heading level={2} id="mcp-heading">
              Add me to your AI
            </Heading>
            <Prose>
              <p>
                Query this CV like an API — connect any MCP-compatible client (Claude, Cursor and
                more) directly to the same career data that powers this site, with full-text answers
                and citations back to the source.
              </p>
            </Prose>
            <Button href="/mcp" variant="solid">
              Explore the MCP endpoint
            </Button>

            <ConnectPanel
              snippets={clientSnippets}
              examplePrompts={connectionMetadata.examplePrompts}
              endpointUrl={endpointUrl}
              deepLinksByClientId={deepLinksByClientId}
              compact
              detailHref="/mcp"
              detailLabel="Explore the full setup, tools, and demo"
            />
          </RevealOnScroll>
        </Container>
      </Section>
    </>
  );
}
