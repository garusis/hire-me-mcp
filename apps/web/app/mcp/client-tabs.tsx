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
 * associated with its `tabpanel` via `aria-controls`/`aria-labelledby` so
 * only the active panel is present for assistive tech.
 */
export function ClientTabs({ items }: ClientTabsProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const baseId = useId();
  const selected = items[selectedIndex];

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
      {selected ? (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${selected.id}`}
          aria-labelledby={`${baseId}-tab-${selected.id}`}
          className={styles.panel}
        >
          {selected.panel}
        </div>
      ) : null}
    </div>
  );
}
