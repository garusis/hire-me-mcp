"use client";

import { type KeyboardEvent, type ReactNode, useId, useState } from "react";
import { cx } from "../design-system/lib/cx";
import styles from "./client-tabs.module.css";

export interface ClientTabItem {
  id: string;
  label: string;
  panel: ReactNode;
}

export interface ClientTabsProps {
  items: ClientTabItem[];
}

/**
 * Per-client MCP setup instructions (#43), one tab per client (Claude
 * web/desktop, Claude Code, Cursor, generic MCP client) — the WAI-ARIA
 * "Tabs with Automatic Activation" pattern
 * (https://www.w3.org/WAI/ARIA/apg/patterns/tabs/), verified 2026-08-20:
 * a `tablist` of `tab` buttons with roving `tabindex` (only the selected tab
 * is in the default tab order), Left/Right arrow keys move focus *and*
 * activate the newly focused tab (wrapping at both ends), and each `tab` is
 * associated with its `tabpanel` via `aria-controls`/`aria-labelledby`.
 *
 * Every panel is rendered into the DOM up front (issue 154) — non-selected ones
 * carry the native `hidden` attribute rather than being conditionally
 * mounted. `hidden` removes them from the accessibility tree and from
 * layout (browsers default `[hidden]` to `display: none`) exactly like the
 * old conditional-mount approach did for assistive tech and sighted users,
 * but the underlying text is still real markup — so a non-JS fetch of the
 * server-rendered HTML (a plain `curl`, a WebFetch-style agent, a crawler)
 * sees every client's setup snippet, not just the default tab's.
 */
export function ClientTabs({ items }: ClientTabsProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const baseId = useId();

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
      return;
    }
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (selectedIndex + direction + items.length) % items.length;
    setSelectedIndex(nextIndex);
    const nextTabId = `${baseId}-tab-${items[nextIndex]?.id}`;
    document.getElementById(nextTabId)?.focus();
  }

  return (
    <div>
      <div role="tablist" aria-label="MCP client setup instructions" className={styles.tablist}>
        {items.map((item, index) => {
          const tabId = `${baseId}-tab-${item.id}`;
          const panelId = `${baseId}-panel-${item.id}`;
          const isSelected = index === selectedIndex;
          return (
            <button
              key={item.id}
              type="button"
              id={tabId}
              role="tab"
              aria-selected={isSelected}
              aria-controls={panelId}
              tabIndex={isSelected ? 0 : -1}
              className={cx(styles.tab, isSelected && styles.tabSelected)}
              onClick={() => setSelectedIndex(index)}
              onKeyDown={handleKeyDown}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item, index) => {
        const isSelected = index === selectedIndex;
        return (
          <div
            key={item.id}
            role="tabpanel"
            id={`${baseId}-panel-${item.id}`}
            aria-labelledby={`${baseId}-tab-${item.id}`}
            hidden={!isSelected}
            className={styles.panel}
          >
            {item.panel}
          </div>
        );
      })}
    </div>
  );
}
