"use client";

import { useCallback, useEffect, useState } from "react";
import { resolveInitialTheme, THEME_STORAGE_KEY, type Theme } from "./resolve-theme";

function readStoredTheme(): string | null {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
}

/**
 * Client-side counterpart to the inline pre-hydration script
 * (`resolve-theme.ts#buildThemeScript`): resolves the same way (stored
 * choice, else `prefers-color-scheme`) so hydration matches what the
 * script already painted, and exposes `setTheme` for `ThemeToggle` to
 * persist an explicit override.
 */
export function useTheme(): { theme: Theme; setTheme: (theme: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") {
      return "light";
    }
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return resolveInitialTheme({ storedValue: readStoredTheme(), prefersDark });
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage unavailable (private browsing, quota) — theme still applies
      // for this render, it just won't persist across reloads.
    }
    applyTheme(next);
  }, []);

  return { theme, setTheme };
}
