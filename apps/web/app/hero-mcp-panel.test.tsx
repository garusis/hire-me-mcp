import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEMO_SKILL_TERM } from "./mcp/demo-transcript-data.js";

// `demo-transcript-data.ts` is `server-only` and reads the real content
// layer — the panel just needs to render whatever it returns, so the
// content-layer lookup itself is exercised by demo-transcript-data.test.ts.
vi.mock("server-only", () => ({}));

const { HeroMcpPanel } = await import("./hero-mcp-panel.js");

describe("HeroMcpPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the given MCP endpoint URL", () => {
    render(<HeroMcpPanel endpointUrl="https://example.com/api/mcp" />);
    expect(screen.getByText("https://example.com/api/mcp")).toBeDefined();
  });

  it("renders the demo question and the get-skill-evidence call the transcript actually makes — no invented data", () => {
    render(<HeroMcpPanel endpointUrl="https://example.com/api/mcp" />);
    expect(screen.getByText(/Has Marcos worked with event-driven architectures/)).toBeDefined();
    const call = screen.getByTestId("hero-mcp-call");
    expect(call.textContent).toContain("get-skill-evidence");
    expect(call.textContent).toContain(DEMO_SKILL_TERM);
    expect(call.textContent).not.toContain("search_career");
  });

  it("renders the real cited answer text from the demo transcript", () => {
    render(<HeroMcpPanel endpointUrl="https://example.com/api/mcp" />);
    // The demo transcript's Claude turn always names at least one citation
    // source (demo-transcript-data.ts throws at build time otherwise), so
    // its rendered answer text should be non-trivial.
    const answer = screen.getByTestId("hero-mcp-answer");
    expect(answer.textContent?.length).toBeGreaterThan(10);
    // The "Calling get-skill-evidence(...) on the hire-me-mcp server…" preamble
    // is rendered as the call line above, not repeated inside the answer.
    expect(answer.textContent).not.toMatch(/^Calling /);
    expect(answer.textContent).toMatch(/^Yes/);
  });
});
