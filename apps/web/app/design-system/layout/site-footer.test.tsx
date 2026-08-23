import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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
});
