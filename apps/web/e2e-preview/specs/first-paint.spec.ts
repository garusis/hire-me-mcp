import { bypassHeaders, withBypassQuery } from "../helpers/bypass";
import { profile } from "../helpers/dataset";
import { expect, test } from "../helpers/fixtures";

/**
 * First-paint / no-JS content visibility (issue 273).
 *
 * The home page's sections are wrapped in `RevealOnScroll`, a scroll
 * animation. The regression this suite locks down is that the animation used
 * to ship its *hidden* state in the server-rendered HTML: the hero rendered
 * as `opacity: 0` and only became visible once client JS added a `revealed`
 * class — so the first paint of the first page was blank, and with JS
 * disabled, blocked or broken the content never appeared at all.
 *
 * Both assertions read the raw server response rather than the hydrated DOM:
 * that byte stream is exactly what a visitor sees before JS runs and all a
 * visitor without JS ever sees.
 */

test("the server-rendered home page ships no hidden-until-JS content", async ({
  request,
  baseURL,
}) => {
  const response = await request.get(`${baseURL}/`);
  expect(response.ok()).toBe(true);
  const html = await response.text();

  // The content is really in the HTML (not client-rendered)...
  expect(html).toContain(profile.name);
  expect(html).toContain(profile.headline);

  // ...and none of it is served in the reveal animation's hidden state.
  // `pending` is only ever applied by client JS, to wrappers the
  // IntersectionObserver has reported as off-screen.
  expect(html).not.toContain('data-reveal="pending"');
});

test("the home page's hero is visible with JavaScript disabled", async ({ browser, baseURL }) => {
  // A fresh context, because `javaScriptEnabled` can only be set at context
  // creation — which also means the suite-wide bypass config doesn't apply
  // to it and has to be re-supplied here (a no-op off a guarded preview).
  const context = await browser.newContext({
    javaScriptEnabled: false,
    extraHTTPHeaders: bypassHeaders(),
  });
  try {
    const page = await context.newPage();
    await page.goto(`${baseURL}${withBypassQuery("/")}`);

    await expect(page.getByRole("heading", { level: 1, name: profile.name })).toBeVisible();
    await expect(page.getByText(profile.headline, { exact: false }).first()).toBeVisible();
  } finally {
    await context.close();
  }
});
