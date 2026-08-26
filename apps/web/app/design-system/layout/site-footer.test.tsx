import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { getProfileView } from "../../../src/lib/content/index.js";
import { SiteFooter } from "./site-footer.js";

describe("SiteFooter", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a footer landmark", () => {
    render(<SiteFooter />);
    expect(screen.getByRole("contentinfo")).toBeDefined();
  });

  it("shows the current year with tabular numerals", () => {
    render(<SiteFooter />);
    const year = new Date().getFullYear().toString();
    expect(screen.getByText(new RegExp(year))).toBeDefined();
  });

  it("links to /llms.txt, the curated MCP-agent entry point (#37)", () => {
    render(<SiteFooter />);
    const link = screen.getByRole("link", { name: /llms\.txt/i });
    expect(link).toHaveAttribute("href", "/llms.txt");
  });

  it("styles the /llms.txt link with the muted-ink treatment, not the plain accent link color (a11y: the default accent link color fails WCAG AA contrast against this footer's subtle background)", () => {
    render(<SiteFooter />);
    const link = screen.getByRole("link", { name: /llms\.txt/i });
    expect(link.className).toMatch(/mutedLink/);
  });

  it("links to /privacy, the public privacy note (#81)", () => {
    render(<SiteFooter />);
    const link = screen.getByRole("link", { name: /privacy/i });
    expect(link).toHaveAttribute("href", "/privacy");
  });

  it("surfaces every profile contact (Email / GitHub / LinkedIn) on every page, not just /privacy (issue 228)", () => {
    render(<SiteFooter />);
    const { profile } = getProfileView();
    expect(profile.contacts.length).toBeGreaterThan(0);
    for (const contact of profile.contacts) {
      // External links append a visually-hidden "(opens in a new tab)" hint
      // to their accessible name, so match on the label as a prefix.
      const link = screen.getByRole("link", { name: new RegExp(`^${contact.label}`) });
      expect(link).toHaveAttribute("href", contact.url);
      // Same muted-ink treatment as the other footer links — the accent
      // color fails WCAG AA against this footer's subtle background.
      expect(link.className).toMatch(/mutedLink/);
    }
  });
});
