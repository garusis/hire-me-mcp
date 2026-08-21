/**
 * Suggested starter questions shown in the chat surface's empty state
 * (#70). Deliberately includes both a "grounded" question (answerable
 * from real career-data facts, e.g. `get_experience`) and a "gap" question
 * (something outside the candidate's real experience, which the system
 * prompt — #65 — requires the agent to say honestly rather than
 * confabulate) — so the agent's honesty behaviour is discoverable without
 * a visitor having to think to coach it into demonstrating that.
 */

export type StarterPromptKind = "grounded" | "gap";

export interface StarterPrompt {
  id: string;
  text: string;
  kind: StarterPromptKind;
}

export const STARTER_PROMPTS: readonly StarterPrompt[] = [
  {
    id: "grounded-house-numbers",
    text: "What did Marcos build at House Numbers?",
    kind: "grounded",
  },
  {
    id: "grounded-projects",
    text: "What are some notable projects Marcos has shipped?",
    kind: "grounded",
  },
  {
    id: "gap-golang",
    text: "Has he worked with Golang?",
    kind: "gap",
  },
];
