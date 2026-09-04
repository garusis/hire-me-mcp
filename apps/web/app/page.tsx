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
import { getRequestNonce } from "../src/lib/security/get-request-nonce";
import { buildPersonJsonLd } from "../src/lib/seo/json-ld";
import { JsonLdScript } from "../src/lib/seo/json-ld-script";
import { RevealOnScroll } from "./design-system/motion/reveal-on-scroll";
import { Badge } from "./design-system/primitives/badge";
import { Button } from "./design-system/primitives/button";
import { Card } from "./design-system/primitives/card";
import { Container } from "./design-system/primitives/container";
import { Heading } from "./design-system/primitives/heading";
import { Link } from "./design-system/primitives/link";
import { Prose } from "./design-system/primitives/prose";
import { Section } from "./design-system/primitives/section";
import { HeroMcpPanel } from "./hero-mcp-panel";
import { getDeepLinksForClient } from "./mcp/client-deep-links";
import { ConnectPanel } from "./mcp/connect-panel";
import styles from "./page.module.css";
import { PROFILE_SECTION_ID } from "./skills/citation-href";

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

/**
 * Title links into the role's own entry on `/experience` (issue 234) — the
 * `/experience` page renders each entry card with `id={slug}`, so the
 * fragment lands directly on this role rather than the top of the page.
 */
function ExperienceHighlightCard({ item }: { item: ExperienceListItemView }) {
  return (
    <Card as="article" className={styles.highlightCard}>
      <Heading level={4} className={styles.highlightCardTitle}>
        <Link href={`/experience#${item.slug}`}>
          {item.entry.role}, {item.entry.company}
        </Link>
      </Heading>
      <p className={styles.highlightCardBody}>{item.entry.summary}</p>
    </Card>
  );
}

/**
 * The flagship (issue 191) treatment: the one `featured: true` project — this
 * portfolio itself — rendered in its own group with a distinct, accented
 * card linking to the full write-up, rather than as just another rail
 * entry. Which project leads is still the content layer's call (the
 * `featured` flag on the record), never an id hardcoded here.
 */
function FlagshipProjectCard({ item }: { item: ProjectListItemView }) {
  return (
    <Card as="article" className={styles.flagshipCard}>
      <p className={styles.flagshipBadge}>
        <Badge variant="status">Flagship</Badge>
      </p>
      <Heading level={4} className={styles.highlightCardTitle}>
        <Link href={`/projects/${item.slug}`}>{item.project.name}</Link>
      </Heading>
      <p className={styles.flagshipRole}>{item.project.role}</p>
      <p className={styles.highlightCardBody}>{item.project.summary}</p>
    </Card>
  );
}

/** Title links to the project's write-up (issue 234) — same treatment the flagship card already had. */
function ProjectHighlightCard({ item }: { item: ProjectListItemView }) {
  return (
    <Card as="article" className={styles.highlightCard}>
      <Heading level={4} className={styles.highlightCardTitle}>
        <Link href={`/projects/${item.slug}`}>{item.project.name}</Link>
      </Heading>
      <p className={styles.highlightCardBody}>{item.project.summary}</p>
    </Card>
  );
}

function SkillBadge({ skill }: { skill: Skill }) {
  return <Badge>{skill.name}</Badge>;
}

export default async function Home() {
  const nonce = await getRequestNonce();
  const profileView = getProfileView();
  const { profile } = profileView;
  const experience = getExperienceListView().items.slice(0, HIGHLIGHT_EXPERIENCE_COUNT);
  const projectItems = getProjectsListView().items;
  const flagship = projectItems.find((item) => item.project.featured === true);
  const projects = projectItems
    .filter((item) => item !== flagship)
    .slice(0, HIGHLIGHT_PROJECT_COUNT);
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
      <JsonLdScript data={buildPersonJsonLd(profileView, allSkills)} nonce={nonce} />

      <Section aria-labelledby="hero-heading">
        <Container>
          <RevealOnScroll>
            <div className={styles.heroGrid}>
              <div>
                <div className={styles.heroBadges}>
                  <Badge variant="status">{AVAILABILITY_LABEL[profile.availability]}</Badge>
                  {/* issue 229 — location + remote status, straight from the profile record. */}
                  <Badge>{profile.location}</Badge>
                </div>
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
              </div>
              <HeroMcpPanel endpointUrl={endpointUrl} />
            </div>
          </RevealOnScroll>
        </Container>
      </Section>

      {/*
        `id` from `citation-href.ts`'s `PROFILE_SECTION_ID`, not a literal:
        this section is where a `[cite:profile:...]` citation points (issue
        227), and sharing the constant keeps the anchor and the citation
        target from drifting apart.
      */}
      <Section id={PROFILE_SECTION_ID} aria-labelledby="bio-heading">
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
                <Link href="/experience" className={styles.seeAllLink}>
                  See full experience
                </Link>
              </div>
            ) : null}

            {flagship !== undefined ? (
              <div className={styles.highlightGroup}>
                <Heading level={3}>Flagship project</Heading>
                <div className={styles.flagshipGrid}>
                  <FlagshipProjectCard item={flagship} />
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
                <Link href="/projects" className={styles.seeAllLink}>
                  See all projects
                </Link>
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
                <Link href="/skills" className={styles.seeAllLink}>
                  See all skills and evidence
                </Link>
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
