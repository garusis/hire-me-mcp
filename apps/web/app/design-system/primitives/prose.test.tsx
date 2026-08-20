import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Prose } from "./prose.js";

describe("Prose", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders long-form children inside a div with typographic rhythm applied", () => {
    render(
      <Prose>
        <p>paragraph</p>
      </Prose>,
    );
    const paragraph = screen.getByText("paragraph");
    expect(paragraph.parentElement?.tagName).toBe("DIV");
  });
});
