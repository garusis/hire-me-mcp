import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Badge } from "./badge.js";

describe("Badge", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders its text content in a span", () => {
    render(<Badge>MCP</Badge>);
    const node = screen.getByText("MCP");
    expect(node.tagName).toBe("SPAN");
  });

  it("defaults to the neutral variant", () => {
    render(<Badge>MCP</Badge>);
    expect(screen.getByText("MCP")).not.toHaveClass("accent");
  });

  it("applies the accent variant when requested", () => {
    render(<Badge variant="accent">MCP</Badge>);
    expect(screen.getByText("MCP").className).toMatch(/accent/);
  });
});
