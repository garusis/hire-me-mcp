"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import styles from "./reveal-on-scroll.module.css";
import { useReducedMotion } from "./use-reduced-motion";

export interface RevealOnScrollProps {
  children: ReactNode;
}

/**
 * Fades/slides children in once they enter the viewport. Under
 * `prefers-reduced-motion: reduce` it renders a plain wrapper with no
 * animation class or `data-reveal` attribute — a true no-op, not just a
 * zero-duration transition.
 */
export function RevealOnScroll({ children }: RevealOnScrollProps) {
  const reducedMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (reducedMotion) {
      return;
    }
    const node = ref.current;
    if (!node) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true);
            observer.disconnect();
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
      className={revealed ? styles.revealed : styles.pending}
      data-reveal={revealed ? "revealed" : "pending"}
    >
      {children}
    </div>
  );
}
