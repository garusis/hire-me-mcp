import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ClientTabs } from "./client-tabs";

const ITEMS = [
  { id: "claude-web", label: "Claude (web/desktop)", panel: <p>Claude setup instructions</p> },
  { id: "claude-code", label: "Claude Code", panel: <p>Claude Code CLI command</p> },
  { id: "cursor", label: "Cursor", panel: <p>Cursor mcp.json snippet</p> },
  { id: "generic", label: "Generic MCP client", panel: <p>Generic client instructions</p> },
];

describe("ClientTabs (#43 per-client setup)", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a tablist landmark with one tab per client, the first selected by default", () => {
    render(<ClientTabs items={ITEMS} />);
    const tablist = screen.getByRole("tablist");
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs).toHaveLength(4);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAttribute("aria-selected", "false");
  });

  it("shows only the selected tab's panel, associated via aria-controls/aria-labelledby, and hides the rest from the accessibility tree", () => {
    render(<ClientTabs items={ITEMS} />);
    expect(screen.getByText("Claude setup instructions")).toBeVisible();
    // Not selected, but per #154 still present in the DOM (just hidden) —
    // see the dedicated no-JS-visibility test below for the full contract.
    expect(screen.getByText("Claude Code CLI command")).not.toBeVisible();

    const tabs = screen.getAllByRole("tab");
    const panel = screen.getByRole("tabpanel");
    const [firstTab] = tabs;
    if (firstTab === undefined) {
      throw new Error("expected at least one tab to render");
    }
    expect(firstTab).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", firstTab.id);
  });

  it("switches panels on click", async () => {
    const user = userEvent.setup();
    render(<ClientTabs items={ITEMS} />);

    await user.click(screen.getByRole("tab", { name: "Cursor" }));

    expect(screen.getByText("Cursor mcp.json snippet")).toBeVisible();
    expect(screen.getByText("Claude setup instructions")).not.toBeVisible();
    expect(screen.getByRole("tab", { name: "Cursor" })).toHaveAttribute("aria-selected", "true");
  });

  it("renders every panel's content into the DOM up front — not just the selected one — so non-active clients' snippets are present in server-rendered/no-JS HTML (#154)", () => {
    render(<ClientTabs items={ITEMS} />);

    // All four panels' distinctive text exist in the DOM, regardless of
    // which tab is selected...
    expect(screen.getByText("Claude setup instructions")).toBeInTheDocument();
    expect(screen.getByText("Claude Code CLI command")).toBeInTheDocument();
    expect(screen.getByText("Cursor mcp.json snippet")).toBeInTheDocument();
    expect(screen.getByText("Generic client instructions")).toBeInTheDocument();

    // ...but only the selected one is visible/exposed to assistive tech.
    expect(screen.getByText("Claude setup instructions")).toBeVisible();
    expect(screen.getByText("Claude Code CLI command")).not.toBeVisible();
    expect(screen.getByText("Cursor mcp.json snippet")).not.toBeVisible();
    expect(screen.getByText("Generic client instructions")).not.toBeVisible();
  });

  it("hides every non-active panel via the native `hidden` attribute, so a screen reader or accessibility-tree query never surfaces it even though the markup is present", () => {
    render(<ClientTabs items={ITEMS} />);

    // getByRole("tabpanel") excludes inaccessible elements by default —
    // exactly one panel (the selected one) should be reachable this way.
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);

    const inactivePanel = screen.getByText("Claude Code CLI command").closest('[role="tabpanel"]');
    expect(inactivePanel).toHaveAttribute("hidden");
  });

  it("is keyboard operable — ArrowRight moves to and activates the next tab, wrapping from the last to the first", async () => {
    const user = userEvent.setup();
    render(<ClientTabs items={ITEMS} />);

    const firstTab = screen.getByRole("tab", { name: "Claude (web/desktop)" });
    firstTab.focus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Claude Code" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Claude Code" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Generic MCP client" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Generic MCP client" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("only the active tab is in the default tab order (roving tabindex)", () => {
    render(<ClientTabs items={ITEMS} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0]).toHaveAttribute("tabindex", "0");
    expect(tabs[1]).toHaveAttribute("tabindex", "-1");
    expect(tabs[2]).toHaveAttribute("tabindex", "-1");
    expect(tabs[3]).toHaveAttribute("tabindex", "-1");
  });
});
