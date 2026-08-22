/**
 * #59 link checker — pure extraction helpers: pulling candidate URLs out of
 * Markdown source and rendered HTML. No network calls live here (see
 * `check-url.mjs` for that) so these are cheap to unit test in isolation.
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const EXCLUDED_DIRS = new Set(["node_modules", ".next", ".turbo", "dist", ".git", "coverage"]);

/** Recursively finds every `*.md` file under `root`, skipping build/dependency directories. */
export function findMarkdownFiles(root) {
  const results = [];
  for (const entry of readdirSync(root)) {
    if (EXCLUDED_DIRS.has(entry)) continue;
    const fullPath = join(root, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      results.push(...findMarkdownFiles(fullPath));
    } else if (entry.endsWith(".md")) {
      results.push(fullPath);
    }
  }
  return results;
}

/** A URL is an un-checkable template placeholder, e.g. `https://<preview>.vercel.app`. */
export function isTemplatePlaceholder(url) {
  return /[<>]/.test(url);
}

/**
 * A URL is a dev-only loopback example in prose (`http://127.0.0.1:3100`),
 * not a real link to check. ONLY applied to Markdown extraction — HTML
 * crawling (`extractHrefsFromHtml`) must NOT filter loopback addresses,
 * since the crawl target itself is legitimately `localhost`/`127.0.0.1`
 * whenever this checker runs against a local dev server (a documented,
 * supported use — see check-links.mjs's module doc).
 */
export function isLoopbackPlaceholder(url) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(url);
}

/** Backwards-compatible combined predicate, kept for Markdown extraction's use case. */
export function isPlaceholderUrl(url) {
  return isTemplatePlaceholder(url) || isLoopbackPlaceholder(url);
}

/** Extracts `[text](https://...)` markdown link targets, deduplicated, minus placeholders. */
export function extractMarkdownLinks(markdownText) {
  const pattern = /\]\((https?:\/\/[^)\s]+)\)/g;
  const found = new Set();
  let match = pattern.exec(markdownText);
  while (match !== null) {
    const url = match[1].replace(/[).,]+$/, "");
    if (!isPlaceholderUrl(url)) {
      found.add(url);
    }
    match = pattern.exec(markdownText);
  }
  return [...found];
}

/**
 * Only `http:`/`https:` URLs are fetchable by this checker. Everything else —
 * `mailto:`, `tel:`, and custom-protocol editor deep links like
 * `cursor://...` or `vscode:...` (the /mcp page's "Add to Cursor/VS Code"
 * buttons, #160) — can't be HTTP-fetched, so skipping them is correct, not
 * a failure to be worked around.
 */
function isHttpUrl(url) {
  return url.protocol === "http:" || url.protocol === "https:";
}

/** Extracts every `href="..."` from rendered HTML, resolved to absolute URLs against `baseUrl`. */
export function extractHrefsFromHtml(html, baseUrl) {
  const pattern = /href="([^"]+)"/g;
  const found = new Set();
  let match = pattern.exec(html);
  while (match !== null) {
    const raw = match[1];
    if (raw.startsWith("#")) {
      match = pattern.exec(html);
      continue;
    }
    try {
      const resolved = new URL(raw, baseUrl);
      if (isHttpUrl(resolved)) {
        const resolvedString = resolved.toString();
        if (!isTemplatePlaceholder(resolvedString)) {
          found.add(resolvedString);
        }
      }
      // else: non-http(s) scheme (mailto:, tel:, cursor:, vscode:, ...) —
      // not fetchable, skip rather than fail the check.
    } catch {
      // Not a resolvable URL (e.g. a malformed href) — skip rather than crash the crawl.
    }
    match = pattern.exec(html);
  }
  return [...found];
}
