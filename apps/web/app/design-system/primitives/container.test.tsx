import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Container } from "./container.js";

describe("Container", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders children inside a div by default", () => {
    render(<Container>content</Container>);
    const node = screen.getByText("content");
    expect(node.tagName).toBe("DIV");
  });

  it("renders as the given element when `as` is provided", () => {
    render(<Container as="section">content</Container>);
    const node = screen.getByText("content");
    expect(node.tagName).toBe("SECTION");
  });
});
