import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./button.js";

describe("Button", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a native button with type=button by default", () => {
    render(<Button>Click</Button>);
    const button = screen.getByRole("button", { name: "Click" });
    expect(button).toHaveAttribute("type", "button");
  });

  it("renders as a link when href is provided", () => {
    render(<Button href="/contact">Contact</Button>);
    expect(screen.getByRole("link", { name: "Contact" })).toHaveAttribute("href", "/contact");
  });

  it("applies the accent variant styles by default and supports outline", () => {
    render(<Button variant="outline">Outline</Button>);
    expect(screen.getByRole("button", { name: "Outline" }).className).toMatch(/outline/);
  });

  it("forwards onClick to the native button", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    screen.getByRole("button", { name: "Click" }).click();
    expect(onClick).toHaveBeenCalledOnce();
  });
});
