"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import styles from "./reveal-on-scroll.module.css";
import { useReducedMotion } from "./use-reduced-motion";

export interface RevealOnScrollProps {
  children: ReactNode;
}

/**
 * Three states, in the order a page moves through them (issue 273):
 *
 * - `static` — no class, no `data-reveal`, fully visible. The state the
 *   server renders and the state the first client paint hydrates into, so
 *   server-rendered content is never hidden by markup that only JS can undo.
 * - `pending` — hidden, waiting to scroll into view. Only ever entered by
 *   client JS, and only for a wrapper the IntersectionObserver reports as
 *   *outside* the viewport, so nothing the visitor can currently see is ever
 *   hidden after the fact.
 * - `revealed` — the animated end state.
 */
type RevealState = "static" | "pending" | "revealed";

const STATE_CLASS: Record<RevealState, string | undefined> = {
  static: undefined,
  pending: styles.pending,
  revealed: styles.revealed,
};

/**
 * Fades/slides children in once they enter the viewport — as a pure
 * enhancement layered on top of already-visible content, never as a
 * default-hidden state baked into the server-rendered HTML (issue 273).
 *
 * The wrapper renders with no animation class at all until client JS has
 * both run *and* observed that this particular wrapper is off-screen. So:
 * first paint shows the content, a visitor with JS disabled or blocked sees
 * the content, a failed/late bundle still shows the content, and anything
 * already on screen at hydration is simply never animated (there is nothing
 * to reveal — it is already revealed).
 *
 * Under `prefers-reduced-motion: reduce` it renders a plain wrapper with no
 * animation class or `data-reveal` attribute — a true no-op, not just a
 * zero-duration transition.
 */
export function RevealOnScroll({ children }: RevealOnScrollProps) {
  const reducedMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<RevealState>("static");

  useEffect(() => {
    if (reducedMotion) {
      return;
    }
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      // No observer (an old browser, a non-DOM test environment): leave the
      // content in its visible `static` state rather than hiding it behind
      // a reveal that can never fire.
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setState("revealed");
            observer.disconnect();
          } else {
            // Off-screen: safe to hide now and animate in on scroll.
            setState("pending");
          }
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [reducedMotion]);

  if (reducedMotion) {
    return <div>{children}</div>;
  }

  return (
    <div
      ref={ref}
      className={STATE_CLASS[state]}
      data-reveal={state === "static" ? undefined : state}
    >
      {children}
    </div>
  );
}
