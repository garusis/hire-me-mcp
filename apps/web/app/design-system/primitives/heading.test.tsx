import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Heading } from "./heading.js";

describe("Heading", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders an h1 for level 1", () => {
    render(<Heading level={1}>Title</Heading>);
    expect(screen.getByRole("heading", { level: 1, name: "Title" })).toBeDefined();
  });

  it("renders an h3 for level 3", () => {
    render(<Heading level={3}>Subtitle</Heading>);
    expect(screen.getByRole("heading", { level: 3, name: "Subtitle" })).toBeDefined();
  });

  it("defaults to level 2 when no level is given", () => {
    render(<Heading>Default</Heading>);
    expect(screen.getByRole("heading", { level: 2, name: "Default" })).toBeDefined();
  });
});
