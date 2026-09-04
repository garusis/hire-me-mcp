import styles from "./hero-mcp-panel.module.css";
import { buildDemoTranscript, DEMO_SKILL_TERM } from "./mcp/demo-transcript-data";

export interface HeroMcpPanelProps {
  endpointUrl: string;
}

/**
 * Splits the demo transcript's Claude turn into the tool-call preamble
 * ("Calling get-skill-evidence(...) on the hire-me-mcp server…") and the
 * cited answer that follows the blank line, so the panel can render the call
 * as a code line and the answer as prose without duplicating either.
 */
function splitAnswer(text: string): string {
  const [, ...rest] = text.split("\n\n");
  return rest.length > 0 ? rest.join("\n\n") : text;
}

/**
 * The hero's right-hand column (issue 308): a mono "MCP query" panel showing
 * the real endpoint URL, the visitor's question, the `get-skill-evidence`
 * call the demo transcript actually makes, and the cited answer `/mcp`'s
 * demo transcript already builds from the live career dataset — no invented
 * data, reusing what's already grounded and rot-guarded
 * (demo-transcript-data.test.ts).
 */
export function HeroMcpPanel({ endpointUrl }: HeroMcpPanelProps) {
  const { turns } = buildDemoTranscript();
  const question = turns.find((turn) => turn.speaker === "You");
  const answer = turns.find((turn) => turn.speaker === "Claude");

  return (
    <div className={styles.panel}>
      <p className={styles.chrome} aria-hidden="true">
        MCP query
      </p>
      <p className={styles.endpoint}>{endpointUrl}</p>
      {question ? <p className={styles.question}>{question.text}</p> : null}
      <pre className={styles.call} data-testid="hero-mcp-call">
        <code>{`get-skill-evidence({ term: "${DEMO_SKILL_TERM}" })`}</code>
      </pre>
      {answer ? (
        <p className={styles.answer} data-testid="hero-mcp-answer">
          {splitAnswer(answer.text)}
        </p>
      ) : null}
    </div>
  );
}
