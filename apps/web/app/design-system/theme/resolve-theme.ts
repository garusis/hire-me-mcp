export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

const VALID_THEMES: readonly Theme[] = ["light", "dark"];

function isTheme(value: string | null): value is Theme {
  return value !== null && (VALID_THEMES as readonly string[]).includes(value);
}

/**
 * Pure resolution logic shared by the inline pre-hydration script (as a
 * string, see {@link buildThemeScript}) and `useTheme` on the client: a
 * stored preference wins, otherwise the theme follows
 * `prefers-color-scheme`.
 */
export function resolveInitialTheme(input: {
  storedValue: string | null;
  prefersDark: boolean;
}): Theme {
  if (isTheme(input.storedValue)) {
    return input.storedValue;
  }
  return input.prefersDark ? "dark" : "light";
}

/**
 * Source for the `beforeInteractive` inline script that sets
 * `data-theme` on `<html>` synchronously, before first paint — this is what
 * prevents a flash of the wrong theme. Kept as a plain string (not JSX)
 * because it runs outside the React tree.
 */
export function buildThemeScript(): string {
  return `(function () {
  try {
    var stored = localStorage.getItem("${THEME_STORAGE_KEY}");
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var theme = stored === "light" || stored === "dark" ? stored : prefersDark ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme;
  } catch (e) {}
})();`;
}
