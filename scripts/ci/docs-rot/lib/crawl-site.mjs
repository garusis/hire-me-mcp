/**
 * #59 link checker — crawls the deployed site starting from `/`, plus the
 * links listed in `/llms.txt` (the site's own agent entry point, #37), to
 * discover every page and outbound link a real visitor (or agent) could
 * reach. Same-origin pages are followed (BFS, bounded); other-origin links
 * are collected as check targets but not followed themselves.
 */

import { extractHrefsFromHtml } from "./link-extraction.mjs";

const USER_AGENT =
  "Mozilla/5.0 (compatible; hire-me-mcp-docs-rot-check/1.0; +https://github.com/garusis/hire-me-mcp)";

function normalizePagePath(url, origin) {
  if (!url.startsWith(origin)) return null;
  const { pathname } = new URL(url);
  return pathname;
}

function enqueueIfNew(queue, visited, path, maxPages) {
  if (path && !visited.has(path) && visited.size + queue.length < maxPages) {
    queue.push(path);
  }
}

/** Fetches one page, recording every link it contains and queueing new same-origin pages to visit. */
async function visitPage(path, { baseUrl, headers, links, visited, queue, maxPages }) {
  visited.add(path);
  const pageUrl = `${baseUrl}${path}`;
  let html;
  try {
    const response = await fetch(pageUrl, { headers: { "User-Agent": USER_AGENT, ...headers } });
    if (!response.ok) {
      links.add(pageUrl); // still record it — checkUrl will report the real status
      return;
    }
    html = await response.text();
  } catch {
    links.add(pageUrl);
    return;
  }

  for (const href of extractHrefsFromHtml(html, pageUrl)) {
    links.add(href);
    enqueueIfNew(queue, visited, normalizePagePath(href, baseUrl), maxPages);
  }
}

/**
 * @param {string} baseUrl - the target deployment's origin, e.g. `https://hire-me-mcp-web.vercel.app`.
 * @param {{ headers?: Record<string,string>, maxPages?: number }} [options]
 * @returns {Promise<{ pages: string[], links: Set<string> }>} every crawled same-origin page path, and every link (any origin) found across them.
 */
export async function crawlSite(baseUrl, { headers = {}, maxPages = 40 } = {}) {
  const visited = new Set();
  const queue = ["/"];
  const links = new Set();

  for (const link of await fetchLlmsTxtLinks(baseUrl, headers)) {
    links.add(link);
    enqueueIfNew(queue, visited, normalizePagePath(link, baseUrl), maxPages);
  }

  while (queue.length > 0 && visited.size < maxPages) {
    const path = queue.shift();
    if (visited.has(path)) continue;
    await visitPage(path, { baseUrl, headers, links, visited, queue, maxPages });
  }

  return { pages: [...visited], links };
}

async function fetchLlmsTxtLinks(baseUrl, headers) {
  try {
    const response = await fetch(`${baseUrl}/llms.txt`, {
      headers: { "User-Agent": USER_AGENT, ...headers },
    });
    if (!response.ok) return [];
    const text = await response.text();
    const pattern = /\((https?:\/\/[^)\s]+)\)/g;
    const found = new Set();
    let match = pattern.exec(text);
    while (match !== null) {
      found.add(match[1]);
      match = pattern.exec(text);
    }
    return [...found];
  } catch {
    return [];
  }
}
