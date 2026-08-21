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
});
