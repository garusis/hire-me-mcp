"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "../lib/cx";
import styles from "./copy-to-clipboard.module.css";

const SUCCESS_TIMEOUT_MS = 2000;

export interface CopyToClipboardProps {
  value: string;
  label: string;
  successLabel?: string;
  className?: string;
}

/**
 * Genuinely interactive — writes to the clipboard and shows a transient
 * success state, so unlike the other primitives this one is a client
 * component. The success message is announced via `aria-live` for screen
 * reader users.
 */
export function CopyToClipboard({
  value,
  label,
  successLabel = "Copied!",
  className,
}: CopyToClipboardProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  async function handleClick() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => setCopied(false), SUCCESS_TIMEOUT_MS);
  }

  return (
    <button type="button" className={cx(styles.button, className)} onClick={handleClick}>
      <span aria-live="polite">{copied ? successLabel : label}</span>
    </button>
  );
}
