import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Home from "./page.js";

describe("Home", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the placeholder heading", () => {
    render(<Home />);

    expect(screen.getByRole("heading", { level: 1, name: "Hire-me MCP" })).toBeDefined();
  });

  it("renders the resolved package names from the workspace domain packages", () => {
    render(<Home />);

    expect(screen.getByText(/Domain package:/)).toBeDefined();
    expect(screen.getByText(/@hire-me-mcp\/core/)).toBeDefined();
    expect(screen.getByText(/Career data package:/)).toBeDefined();
    expect(screen.getByText(/@hire-me-mcp\/career-data/)).toBeDefined();
  });
});
