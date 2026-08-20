import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DemoTranscript } from "./demo-transcript";

describe("DemoTranscript (#43 demo media placeholder)", () => {
  afterEach(() => {
    cleanup();
  });

  it("has a text alternative for the transcript as a whole via an accessible group label", () => {
    render(<DemoTranscript />);
    expect(
      screen.getByRole("group", { name: /transcript|conversation|demo/i }),
    ).toBeInTheDocument();
  });

  it("renders no <video> or <img> element — this is a static, honest text mock, not a recorded screenshot or fabricated UI", () => {
    const { container } = render(<DemoTranscript />);
    expect(container.querySelector("video")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("labels itself as a mock transcript, not a real recorded session, right in the visible copy", () => {
    render(<DemoTranscript />);
    expect(screen.getByText(/mock|illustrative|not a recording|sample/i)).toBeInTheDocument();
  });

  it("declares no autoplaying motion — every line is present in the DOM immediately, nothing is deferred behind an animation", () => {
    render(<DemoTranscript />);
    const turns = screen.getAllByRole("listitem");
    expect(turns.length).toBeGreaterThan(0);
    for (const turn of turns) {
      expect(turn).toBeVisible();
    }
  });
});
