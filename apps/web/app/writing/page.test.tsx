import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WritingListView } from "../../src/lib/content";

const { getWritingListView } = vi.hoisted(() => ({
  getWritingListView: vi.fn(),
}));

vi.mock("../../src/lib/content", () => ({
  getWritingListView,
}));

function writingView(): WritingListView {
  return {
    citations: [],
    items: [
      {
        slug: "second-post",
        entry: {
          id: "second-post",
          title: "Second Post",
          publishedDate: "2024-06-01",
          summary: "The second post's summary.",
          body: "body",
          url: "https://blog.example.com/second-post",
        },
        citation: { entityType: "writing", entityId: "second-post", label: "Second Post" },
      },
      {
        slug: "first-post",
        entry: {
          id: "first-post",
          title: "First Post",
          publishedDate: "2023-01-15",
          summary: "The first post's summary.",
          body: "First post local body prose.",
        },
        citation: { entityType: "writing", entityId: "first-post", label: "First Post" },
      },
    ],
  };
}

describe("Writing page", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders every writing entry from the stubbed content layer, in the order returned", async () => {
    getWritingListView.mockReturnValue(writingView());
    const { default: WritingPage } = await import("./page.js");

    render(await WritingPage());

    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((heading) => heading.textContent?.startsWith("Second Post"))).toEqual([
      true,
      false,
    ]);
    expect(headings.map((heading) => heading.textContent?.startsWith("First Post"))).toEqual([
      false,
      true,
    ]);
  });

  it("renders title, date and summary for each entry", async () => {
    getWritingListView.mockReturnValue(writingView());
    const { default: WritingPage } = await import("./page.js");

    render(await WritingPage());

    expect(screen.getByText(/2024-06-01/)).toBeDefined();
    expect(screen.getByText("The second post's summary.")).toBeDefined();
    expect(screen.getByText(/2023-01-15/)).toBeDefined();
    expect(screen.getByText("The first post's summary.")).toBeDefined();
  });

  it("links an entry with a canonical external URL to that URL, marked as external", async () => {
    getWritingListView.mockReturnValue(writingView());
    const { default: WritingPage } = await import("./page.js");

    render(await WritingPage());

    const link = screen.getByRole("link", { name: /Second Post/ });
    expect(link).toHaveAttribute("href", "https://blog.example.com/second-post");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("links an entry with no external URL to its local /writing/[slug] detail route", async () => {
    getWritingListView.mockReturnValue(writingView());
    const { default: WritingPage } = await import("./page.js");

    render(await WritingPage());

    const link = screen.getByRole("link", { name: /First Post/ });
    expect(link).toHaveAttribute("href", "/writing/first-post");
    expect(link).not.toHaveAttribute("target");
  });

  it("renders the documented empty state when there are no writing entries yet", async () => {
    getWritingListView.mockReturnValue({ items: [], citations: [] });
    const { default: WritingPage } = await import("./page.js");

    render(await WritingPage());

    expect(screen.getByText(/nothing published/i)).toBeDefined();
    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
  });
});
