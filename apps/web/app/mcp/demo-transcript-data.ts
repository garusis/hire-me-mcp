/**
 * Builds the /mcp "See it in action" transcript from the REAL career
 * dataset (issue 225). The previous version of this section was a hand-written
 * sample that invented a role ("mcp-gateway-service") and a project ("Order
 * Events Pipeline") that exist nowhere in the data — the worst possible
 * thing to print on a hiring site. This module instead runs the same
 * `get-skill-evidence` lookup the live MCP server exposes, against the same
 * dataset, and formats the actual result — so every entity the transcript
 * names is a real record by construction, and content edits update the
 * transcript automatically at build time.
 */

import "server-only";
import { getSkillEvidenceView } from "../../src/lib/content";

/** The question the transcript demonstrates — a real, claimed skill lookup. */
export const DEMO_SKILL_TERM = "event-driven architecture";

export interface DemoTurn {
  speaker: "You" | "Claude";
  text: string;
}

export interface DemoTranscriptData {
  turns: DemoTurn[];
  /** Labels of every dataset record the transcript cites — for the rot guard. */
  citedLabels: string[];
}

function formatList(items: string[]): string {
  if (items.length <= 1) {
    return items.join("");
  }
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * Formats the real `get-skill-evidence` outcome into the two-turn sample
 * transcript. Throws (failing the build/test, never rendering a fabricated
 * or empty answer) if the demo term stops resolving to a claimed skill —
 * that would mean the question no longer demonstrates what the copy says.
 */
export function buildDemoTranscript(): DemoTranscriptData {
  const { outcome } = getSkillEvidenceView(DEMO_SKILL_TERM);
  if (outcome.kind !== "claimed") {
    throw new Error(
      `Demo transcript term "${DEMO_SKILL_TERM}" no longer resolves to a claimed skill ` +
        `(got "${outcome.kind}") — pick a claimed skill so the sample stays truthful.`,
    );
  }

  const sourceLabels = [...new Set(outcome.evidence.map((citation) => citation.label))];
  const sources = formatList(sourceLabels);
  const plural = sourceLabels.length === 1 ? "source" : "sources";

  return {
    turns: [
      {
        speaker: "You",
        text: "Has Marcos worked with event-driven architectures? Show me evidence.",
      },
      {
        speaker: "Claude",
        text:
          `Calling get-skill-evidence({ term: "${DEMO_SKILL_TERM}" }) on the hire-me-mcp ` +
          `server…\n\nYes — "${outcome.skill.name}" is a claimed skill ` +
          `(proficiency: ${outcome.skill.proficiency}), backed by ${sourceLabels.length} cited ` +
          `${plural}: ${sources}. Want the underlying highlight?`,
      },
    ],
    citedLabels: [outcome.skill.name, ...sourceLabels],
  };
}
