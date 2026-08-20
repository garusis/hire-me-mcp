import { cx } from "../design-system/lib/cx";
import styles from "./demo-transcript.module.css";

interface Turn {
  speaker: "You" | "Claude";
  text: string;
}

/**
 * Demo media placeholder decision (#43): the AC asks for "a short demo (gif
 * or video) of an assistant querying the CV through it," but this agent has
 * no way to record or capture one. Rather than leave a broken `<img>`/an
 * empty "coming soon" box, this renders a plain, static, honestly-labeled
 * text transcript — no screenshots, no fabricated product chrome, nothing
 * claiming to be a real recording. It is explicitly a **deviation** noted
 * for the project owner: replace this component's content (or swap the
 * section entirely) with a real recorded gif/video once one exists, at
 * which point the accessible-text-alternative and no-autoplay requirements
 * below should move to the real asset (`alt`/a transcript in the caption,
 * `poster`, no autoplaying sound) instead of this component.
 *
 * Because every turn renders directly into the DOM with no animation, delay,
 * or `IntersectionObserver` reveal, there is nothing to pause or freeze for
 * `prefers-reduced-motion` — the reduced-motion requirement in the AC is
 * satisfied trivially by having no motion in the first place, not by
 * detecting the media query.
 */
const TRANSCRIPT: Turn[] = [
  { speaker: "You", text: "Has Marcos worked with event-driven architectures? Show me evidence." },
  {
    speaker: "Claude",
    text:
      'Calling get-skill-evidence({ term: "event-driven architecture" }) on the hire-me-mcp ' +
      "server…\n\nYes — claimed, with 2 sources: the mcp-gateway-service role (2022–2024) and " +
      'the search-projects entry for "Order Events Pipeline". Want the details of either?',
  },
];

export function DemoTranscript() {
  return (
    <fieldset
      className={styles.fieldset}
      aria-label="Illustrative MCP query transcript (mock, not a recording)"
    >
      <p>
        A short recorded demo isn&apos;t available yet — this is a hand-written, illustrative sample
        transcript of a real question this server can answer, not a screenshot or actual recording
        of a session.
      </p>
      <ul className={styles.transcript}>
        {TRANSCRIPT.map((turn) => (
          <li
            key={`${turn.speaker}-${turn.text.slice(0, 16)}`}
            className={cx(styles.turn, turn.speaker === "You" ? styles.user : styles.assistant)}
          >
            <span className={styles.speaker}>{turn.speaker}</span>
            {turn.text}
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
