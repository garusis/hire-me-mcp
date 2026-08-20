"use client";

import styles from "./theme-toggle.module.css";
import { useTheme } from "./use-theme";

/**
 * The only component in the theme layer that needs interactivity — reads
 * and writes the current theme via `useTheme`. Rendered as a real `<button>`
 * with `aria-pressed` so its state is exposed to assistive tech, keyboard
 * operable by default, and styled with the shared focus-visible ring.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className={styles.toggle}
      aria-pressed={isDark}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      <span aria-hidden="true">{isDark ? "🌙" : "☀️"}</span>
      <span>{isDark ? "Dark theme" : "Light theme"}</span>
    </button>
  );
}
