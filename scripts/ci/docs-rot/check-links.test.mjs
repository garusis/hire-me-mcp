/**
 * #59 link checker — unit tests for the pure extraction/network helpers.
 * Plain `node --test`, same convention as `extract-artifacts.test.mjs`.
 * Run: `node --test scripts/ci/docs-rot/*.test.mjs`.
 */

import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { checkUrl, checkUrlsConcurrently } from "./lib/check-url.mjs";
import { crawlSite } from "./lib/crawl-site.mjs";
import {
  extractHrefsFromHtml,
  extractMarkdownLinks,
  isPlaceholderUrl,
} from "./lib/link-extraction.mjs";

test("extractMarkdownLinks finds http(s) link targets and dedupes them", () => {
  const text =
    "See [a](https://example.com/a) and again [a2](https://example.com/a) and [b](https://example.com/b).";
  assert.deepEqual(extractMarkdownLinks(text), ["https://example.com/a", "https://example.com/b"]);
});

test("extractMarkdownLinks skips placeholder/localhost URLs", () => {
  const text =
    "[preview](https://<preview>.vercel.app) [local](http://127.0.0.1:3100) [real](https://example.com)";
  assert.deepEqual(extractMarkdownLinks(text), ["https://example.com"]);
});

test("isPlaceholderUrl flags template and loopback URLs", () => {
  assert.equal(isPlaceholderUrl("https://<preview>.vercel.app"), true);
  assert.equal(isPlaceholderUrl("http://127.0.0.1:3100"), true);
  assert.equal(isPlaceholderUrl("http://localhost:3000"), true);
  assert.equal(isPlaceholderUrl("https://example.com"), false);
});

test("extractHrefsFromHtml resolves relative hrefs and skips mailto/tel/#", () => {
  const html = `
    <a href="/about">about</a>
    <a href="https://example.com/x">x</a>
    <a href="mailto:a@b.com">mail</a>
    <a href="#section">anchor</a>
  `;
  const hrefs = extractHrefsFromHtml(html, "https://site.test");
  assert.deepEqual(hrefs.sort(), ["https://example.com/x", "https://site.test/about"]);
});

test("checkUrl reports ok:true for a 200 response", async () => {
  const server = createServer((_req, res) => {
    res.writeHead(200);
    res.end("ok");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const url = `http://127.0.0.1:${server.address().port}/`;
    const result = await checkUrl(url, { retries: 0 });
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
  } finally {
    server.close();
  }
});

test("checkUrl falls back from HEAD to GET when HEAD is not ok", async () => {
  const server = createServer((req, res) => {
    if (req.method === "HEAD") {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200);
    res.end("ok");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const url = `http://127.0.0.1:${server.address().port}/`;
    const result = await checkUrl(url, { retries: 0 });
    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
  } finally {
    server.close();
  }
});

test("checkUrl reports ok:false and the status for a 404", async () => {
  const server = createServer((_req, res) => {
    res.writeHead(404);
    res.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const url = `http://127.0.0.1:${server.address().port}/missing`;
    const result = await checkUrl(url, { retries: 0 });
    assert.equal(result.ok, false);
    assert.equal(result.status, 404);
  } finally {
    server.close();
  }
});

test("checkUrl retries on 5xx and eventually reports failure for an always-broken URL", async () => {
  let hits = 0;
  const server = createServer((_req, res) => {
    hits++;
    res.writeHead(500);
    res.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const url = `http://127.0.0.1:${server.address().port}/`;
    const result = await checkUrl(url, { retries: 2, backoffMs: 5 });
    assert.equal(result.ok, false);
    // Each attempt tries HEAD then falls back to GET (both always 500 here),
    // so (initial attempt + 2 retries) * 2 requests = 6.
    assert.equal(hits, 6);
  } finally {
    server.close();
  }
});

test("checkUrlsConcurrently checks every URL and preserves order", async () => {
  const server = createServer((req, res) => {
    if (req.url === "/ok") {
      res.writeHead(200);
    } else {
      res.writeHead(404);
    }
    res.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const results = await checkUrlsConcurrently(
      [`${base}/ok`, `${base}/missing`],
      { retries: 0 },
      2,
    );
    assert.equal(results[0].ok, true);
    assert.equal(results[1].ok, false);
  } finally {
    server.close();
  }
});

test("crawlSite follows same-origin links and collects outbound links", async () => {
  const server = createServer((req, res) => {
    if (req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        '<html><body><a href="/about">about</a><a href="https://external.test/x">x</a></body></html>',
      );
      return;
    }
    if (req.url === "/about") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html><body>about page</body></html>");
      return;
    }
    if (req.url === "/llms.txt") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("nothing here");
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const { pages, links } = await crawlSite(baseUrl, { maxPages: 10 });
    assert.ok(pages.includes("/"));
    assert.ok(pages.includes("/about"));
    assert.ok(links.has(`${baseUrl}/about`));
    assert.ok(links.has("https://external.test/x"));
  } finally {
    server.close();
  }
});
