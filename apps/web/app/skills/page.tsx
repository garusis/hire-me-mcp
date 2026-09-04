import type { Citation } from "@hire-me-mcp/core";
import type { Metadata } from "next";
import type { GapListItemView, Skill, StoryParentRef, WritingEntry } from "../../src/lib/content";
import {
  getGapsListView,
  getProfileView,
  getSkillsListView,
  getWritingListView,
  listStoryParents,
  toSlug,
} from "../../src/lib/content";
import { buildPageMetadata } from "../../src/lib/seo/page-metadata";
import { Badge } from "../design-system/primitives/badge";
import { Card } from "../design-system/primitives/card";
import { Container } from "../design-system/primitives/container";
import { Heading } from "../design-system/primitives/heading";
import { Link } from "../design-system/primitives/link";
import { Prose } from "../design-system/primitives/prose";
import { Section } from "../design-system/primitives/section";
import { resolveCitationHref } from "./citation-href";
import { groupByProficiency } from "./group-by-proficiency";
import styles from "./page.module.css";

const PROFICIENCY_LABEL: Record<Skill["proficiency"], string> = {
  expert: "Expert",
  proficient: "Proficient",
  familiar: "Familiar",
};

function EvidenceCitations({
  evidence,
  writingEntries,
  storyParents,
}: {
  evidence: Citation[];
  writingEntries: readonly WritingEntry[];
  storyParents: readonly StoryParentRef[];
}) {
  if (evidence.length === 0) {
    return (
      <p role="alert" className={styles.noEvidence}>
        No evidence on file for this claim.
      </p>
    );
  }

  return (
    <ul className={styles.evidenceList}>
      {evidence.map((citation) => (
        <li key={`${citation.entityType}-${citation.entityId}-${citation.fragment ?? ""}`}>
          <Link href={resolveCitationHref(citation, writingEntries, storyParents)}>
            {citation.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * A skill claimed with two or more independent citations is visually
 * distinguished (accent badge, "N sources") from one resting on a single
 * citation (neutral badge, "Single source") — the evidence-strength
 * distinction the issue calls for, computed straight from
 * `skill.evidence.length` rather than a separately authored rating.
 */
function EvidenceStrengthBadge({ count }: { count: number }) {
  const strong = count >= 2;
  return (
    <Badge variant={strong ? "status" : "neutral"}>
      {strong ? `${count} sources` : "Single source"}
    </Badge>
  );
}

function SkillCard({
  skill,
  writingEntries,
  storyParents,
}: {
  skill: Skill;
  writingEntries: readonly WritingEntry[];
  storyParents: readonly StoryParentRef[];
}) {
  return (
    <Card as="article" compact id={toSlug(skill.id)}>
      <div className={styles.skillHead}>
        <Heading level={3}>{skill.name}</Heading>
        <EvidenceStrengthBadge count={skill.evidence.length} />
      </div>
      <EvidenceCitations
        evidence={skill.evidence}
        writingEntries={writingEntries}
        storyParents={storyParents}
      />
    </Card>
  );
}

function GapCard({ item }: { item: GapListItemView }) {
  const { gap, relatedSkills } = item;
  return (
    <Card as="article" id={`gap-${toSlug(gap.id)}`}>
      <Heading level={3}>{gap.name}</Heading>
      <Prose>
        <p>{gap.statement}</p>
      </Prose>
      {relatedSkills.length > 0 && (
        <>
          <Heading level={4}>Closest related experience</Heading>
          <ul className={styles.relatedSkills}>
            {relatedSkills.map((related) => (
              <li key={related.id}>
                <Link href={`/skills#${toSlug(related.id)}`}>{related.name}</Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

/** Description names every claimed skill, so it changes whenever the content layer does. */
export function generateMetadata(): Metadata {
  const { profile } = getProfileView();
  const { items } = getSkillsListView();
  const names = items.map((skill) => skill.name).join(", ");
  return buildPageMetadata({
    title: "Skills",
    description: `${profile.name}'s claimed skills, each with cited evidence: ${names}.`,
    path: "/skills",
  });
}

/**
 * Every claimed skill, grouped by proficiency tier as the content layer
 * orders them (#16), each rendering its own evidence citations linked back
 * to the experience/project/writing surface that backs it — plus an equally
 * deliberate "what I don't claim" section rendering every recorded gap
 * (#2's honesty discipline), copy taken straight from the data rather than
 * authored in this component.
 */
export default function SkillsPage() {
  const { items: skills } = getSkillsListView();
  const { items: gaps } = getGapsListView();
  const { items: writingItems } = getWritingListView();
  const writingEntries = writingItems.map((item) => item.entry);
  const storyParents = listStoryParents();
  const groups = groupByProficiency(skills);

  return (
    <Section>
      <Container>
        <Heading level={1}>Skills</Heading>
        {groups.map((group) => (
          <div key={group.proficiency} className={styles.tierGroup}>
            <Heading level={2}>{PROFICIENCY_LABEL[group.proficiency]}</Heading>
            <ul className={styles.tierList}>
              {group.items.map((skill) => (
                <li key={skill.id}>
                  <SkillCard
                    skill={skill}
                    writingEntries={writingEntries}
                    storyParents={storyParents}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className={styles.gapsSection}>
          <Heading level={2}>What I don&apos;t claim</Heading>
          <Prose>
            <p>
              Skills below are recorded gaps, not omissions — explicit, sourced statements of what
              isn&apos;t claimed, so an honest answer doesn&apos;t depend on silence.
            </p>
          </Prose>
          <ul className={styles.gapList}>
            {gaps.map((item) => (
              <li key={item.gap.id}>
                <GapCard item={item} />
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </Section>
  );
}
