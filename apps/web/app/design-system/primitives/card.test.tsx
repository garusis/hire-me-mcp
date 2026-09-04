import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Card } from "./card.js";

describe("Card", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders as a div by default", () => {
    render(<Card>content</Card>);
    expect(screen.getByText("content").tagName).toBe("DIV");
  });

  it("renders as the given element when `as` is provided", () => {
    render(<Card as="article">content</Card>);
    expect(screen.getByText("content").tagName).toBe("ARTICLE");
  });

  it("applies the compact padding variant when requested, for dense entries like Skills", () => {
    render(<Card compact>content</Card>);
    expect(screen.getByText("content").className).toMatch(/compact/);
  });
});
