import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SkipLink } from "./skip-link.js";

describe("SkipLink", () => {
  afterEach(() => {
    cleanup();
  });

  it("links to the main content landmark", () => {
    render(<SkipLink />);
    const link = screen.getByRole("link", { name: /skip to (main )?content/i });
    expect(link).toHaveAttribute("href", "#main-content");
  });
});
