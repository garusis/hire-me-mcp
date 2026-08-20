import { describe, expect, it } from "vitest";
import { buildThemeScript, resolveInitialTheme, THEME_STORAGE_KEY } from "./resolve-theme.js";

describe("resolveInitialTheme", () => {
  it("returns the stored preference when localStorage holds a valid theme", () => {
    expect(resolveInitialTheme({ storedValue: "dark", prefersDark: false })).toBe("dark");
    expect(resolveInitialTheme({ storedValue: "light", prefersDark: true })).toBe("light");
  });

  it("falls back to the system preference when no stored value is present", () => {
    expect(resolveInitialTheme({ storedValue: null, prefersDark: true })).toBe("dark");
    expect(resolveInitialTheme({ storedValue: null, prefersDark: false })).toBe("light");
  });

  it("falls back to the system preference when the stored value is invalid", () => {
    expect(resolveInitialTheme({ storedValue: "sepia", prefersDark: true })).toBe("dark");
  });
});

describe("THEME_STORAGE_KEY", () => {
  it("is a stable, non-empty localStorage key", () => {
    expect(THEME_STORAGE_KEY).toBe("theme");
  });
});

describe("buildThemeScript", () => {
  it("embeds the storage key so the inline script reads the same key useTheme writes", () => {
    expect(buildThemeScript()).toContain(THEME_STORAGE_KEY);
  });

  it("sets the resolved theme on the root element before paint", () => {
    const script = buildThemeScript();
    expect(script).toContain("document.documentElement");
    expect(script).toContain("data-theme");
  });
});
