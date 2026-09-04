import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_STORAGE_KEY } from "./resolve-theme.js";
import { ThemeToggle } from "./theme-toggle.js";

function stubMatchMedia(prefersDark: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === "(prefers-color-scheme: dark)" ? prefersDark : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    stubMatchMedia(false);
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("renders an accessible, keyboard-operable toggle button", () => {
    render(<ThemeToggle />);
    const toggle = screen.getByRole("button", { name: /theme/i });
    expect(toggle).toBeDefined();
  });

  it("switches from light to dark on click and persists the choice", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    const toggle = screen.getByRole("button", { name: /theme/i });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("is operable via the keyboard", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.tab();
    const toggle = screen.getByRole("button", { name: /theme/i });
    expect(toggle).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
  });

  it("renders the theme label in a dedicated element the CSS can hide on small screens (issue 308)", () => {
    render(<ThemeToggle />);
    const toggle = screen.getByRole("button", { name: /theme/i });
    const label = toggle.querySelector("[data-toggle-label]");
    expect(label).not.toBeNull();
    expect(label?.textContent).toMatch(/theme/i);
  });

  it("keeps an accessible name via aria-label so the button stays labeled once the visible label is hidden below 768px", () => {
    render(<ThemeToggle />);
    const toggle = screen.getByRole("button", { name: /theme/i });
    expect(toggle).toHaveAttribute("aria-label");
  });

  it("applies a previously persisted choice on mount", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render(<ThemeToggle />);

    expect(screen.getByRole("button", { name: /theme/i })).toHaveAttribute("aria-pressed", "true");
  });
});
