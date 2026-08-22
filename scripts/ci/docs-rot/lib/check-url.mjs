/**
 * #59 link checker — network layer: checks one URL's status with retry +
 * exponential backoff (external link checking is inherently flaky per the
 * issue), and a small bounded concurrency pool so a repo-wide + site-wide
 * link sweep doesn't fire hundreds of requests at once.
 */

const USER_AGENT =
  "Mozilla/5.0 (compatible; hire-me-mcp-docs-rot-check/1.0; +https://github.com/garusis/hire-me-mcp)";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probe(url, method, headers) {
  return fetch(url, {
    method,
    headers: { "User-Agent": USER_AGENT, ...headers },
    redirect: "follow",
  });
}

/**
 * One attempt: HEAD first (cheaper), falling back to GET whenever HEAD
 * didn't come back ok — not just on 405/501. Several real hosts in this
 * repo's link set (e.g. some CDN-fronted docs sites) answer HEAD
 * differently from GET for reasons that have nothing to do with whether
 * the page actually exists, so GET is the authoritative check whenever
 * HEAD disagrees with it.
 */
async function probeWithFallback(url, headers, getOnly) {
  if (getOnly) {
    return probe(url, "GET", headers);
  }
  const headResponse = await probe(url, "HEAD", headers);
  if (headResponse.ok) {
    return headResponse;
  }
  return probe(url, "GET", headers);
}

/**
 * Checks one URL, retrying on network errors or 429/5xx with exponential
 * backoff (external link checking is inherently flaky per the issue).
 */
export async function checkUrl(
  url,
  { headers = {}, retries = 3, backoffMs = 500, getOnly = false } = {},
) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await probeWithFallback(url, headers, getOnly);
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`HTTP ${response.status}`);
      } else {
        return { url, status: response.status, ok: response.status < 400 };
      }
    } catch (error) {
      lastError = error;
    }
    if (attempt < retries) {
      await sleep(backoffMs * 2 ** attempt);
    }
  }
  return { url, status: undefined, ok: false, error: lastError?.message ?? "unknown error" };
}

/** Runs `checkUrl` over every URL in `urls` with at most `concurrency` in flight at once. */
export async function checkUrlsConcurrently(urls, options, concurrency = 6) {
  const results = new Array(urls.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < urls.length) {
      const index = nextIndex++;
      results[index] = await checkUrl(urls[index], options);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
