"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "../lib/cx";
import styles from "./copy-to-clipboard.module.css";

const SUCCESS_TIMEOUT_MS = 2000;

export interface CopyToClipboardProps {
  value: string;
  label: string;
  successLabel?: string;
  manualLabel?: string;
  className?: string;
}

type CopyStatus = "idle" | "copied" | "manual";

/**
 * Copies via a temporary, off-screen `<textarea>` + `document.execCommand("copy")`
 * — the fallback for browsers/contexts where the async Clipboard API is
 * unavailable (no `navigator.clipboard`, an insecure/non-HTTPS context, or a
 * permission denial). `execCommand` is deprecated but still broadly
 * supported specifically as a copy fallback, and there is no standard
 * replacement for a synchronous, permission-less copy (#45).
 */
function copyWithExecCommand(value: string): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  let succeeded = false;
  try {
    succeeded = document.execCommand("copy");
  } catch {
    succeeded = false;
  }
  document.body.removeChild(textarea);
  return succeeded;
}

/**
 * Tries the async Clipboard API first, falling back to `execCommand` when
 * it's unavailable or rejects. Returns whether the value actually made it
 * onto the clipboard — the caller uses this to decide whether to show a
 * success state or a manual-copy prompt.
 */
async function copyValue(value: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall through to the execCommand fallback below.
    }
  }
  return copyWithExecCommand(value);
}

/**
 * Genuinely interactive — writes to the clipboard and shows a transient
 * success state, so unlike the other primitives this one is a client
 * component. Falls back to `document.execCommand("copy")` when the async
 * Clipboard API is unavailable, and to a manual-copy prompt when neither
 * works (#45). The status message is announced via `aria-live` for screen
 * reader users in every case.
 */
export function CopyToClipboard({
  value,
  label,
  successLabel = "Copied!",
  manualLabel = "Copy failed — select the text above and copy manually",
  className,
}: CopyToClipboardProps) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  async function handleClick() {
    const succeeded = await copyValue(value);
    setStatus(succeeded ? "copied" : "manual");
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => setStatus("idle"), SUCCESS_TIMEOUT_MS);
  }

  const statusLabel =
    status === "copied" ? successLabel : status === "manual" ? manualLabel : label;

  return (
    <button type="button" className={cx(styles.button, className)} onClick={handleClick}>
      <span aria-live="polite">{statusLabel}</span>
    </button>
  );
}
