import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Section } from "./section.js";

describe("Section", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a <section> landmark", () => {
    render(<Section>content</Section>);
    expect(screen.getByText("content").tagName).toBe("SECTION");
  });

  it("forwards aria-labelledby so it can be associated with a heading", () => {
    render(
      <Section aria-labelledby="my-heading">
        <span>content</span>
      </Section>,
    );
    expect(screen.getByText("content").closest("section")).toHaveAttribute(
      "aria-labelledby",
      "my-heading",
    );
  });
});
