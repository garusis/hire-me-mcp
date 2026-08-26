import { cx } from "../design-system/lib/cx";
import styles from "./demo-transcript.module.css";
import { buildDemoTranscript } from "./demo-transcript-data";

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
 * Issue 225: the transcript's answer turn is no longer hand-written — it is
 * generated at build/render time from the real career dataset by
 * `buildDemoTranscript()`, running the same `get-skill-evidence` lookup the
 * live server exposes. Every role/project/skill it names is a real record
 * by construction; `demo-transcript-data.test.ts` is the rot guard.
 *
 * Because every turn renders directly into the DOM with no animation, delay,
 * or `IntersectionObserver` reveal, there is nothing to pause or freeze for
 * `prefers-reduced-motion` — the reduced-motion requirement in the AC is
 * satisfied trivially by having no motion in the first place, not by
 * detecting the media query.
 */
export function DemoTranscript() {
  const { turns } = buildDemoTranscript();
  return (
    <fieldset
      className={styles.fieldset}
      aria-label="Sample MCP query transcript generated from the real career data (not a recording)"
    >
      <p>
        A short recorded demo isn&apos;t available yet — this is a sample transcript of a real
        question this server can answer, with the answer generated from the same career data the
        live endpoint serves. It is not a screenshot or actual recording of a session.
      </p>
      <ul className={styles.transcript}>
        {turns.map((turn) => (
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
