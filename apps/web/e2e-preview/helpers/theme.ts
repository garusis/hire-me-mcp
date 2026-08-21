import { expect, type Page } from "@playwright/test";

/**
 * Sets the persisted theme (same mechanism as `apps/web/e2e/*.screenshot.spec.ts`)
 * and reloads so `resolve-theme`'s inline script re-applies it.
 *
 * #128: `page.reload()` resolves once navigation is committed, not once the
 * document is actually settled — a caller that runs `axe.analyze()` (or
 * anything else DOM-dependent) immediately after `await setTheme(...)` can
 * race the reload and scan a still-loading document, which is exactly the
 * flaky `doc-has-title` axe failure the issue describes (SSR HTML always has
 * a `<title>`, so a title-less scan means the scan ran too early). The fix
 * lives here, in the shared helper, rather than in each call site, so every
 * spec that reloads via `setTheme` gets the same readiness gate for free:
 * wait for the title to be non-empty as a cheap, reliable proxy for "the
 * reloaded document has settled" before returning control to the caller.
 *
 * #132: `doc-has-title` wasn't the whole story — the preview accessibility
 * suite also saw dark-theme-only axe failures, but only when run locally
 * against a local prod build, never in CI against a real preview. Root
 * cause is the same family as the screenshot-spec flake: the reloaded page
 * still has `RevealOnScroll` wrappers fading in (opacity/transform CSS
 * transitions) for whatever sections are in the viewport on load, and a
 * fast local machine can call `axe.analyze()` while that transition is
 * mid-flight, momentarily depressing text opacity enough to read as a
 * color-contrast violation. A title existing says the document loaded; it
 * says nothing about in-flight CSS transitions. So, after the title check,
 * this now also waits for `<html data-theme>` to actually reflect the
 * requested theme (the inline resolve-theme script runs before hydration,
 * but confirming it removes any doubt) and then for a settled animation
 * frame — every `Animation` the page knows about (CSS transitions included,
 * per the Web Animations API) resolved — before handing control back.
 */
export async function setTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.evaluate((t) => {
    localStorage.setItem("theme", t);
    document.documentElement.setAttribute("data-theme", t);
  }, theme);
  await page.reload();
  await expect(page).toHaveTitle(/.+/);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.getAttribute("data-theme")))
    .toBe(theme);
  await page.evaluate(async () => {
    // Two animation frames: the first lets any observer callback that fires
    // on initial layout (e.g. RevealOnScroll's IntersectionObserver for
    // above-the-fold content) actually kick off its transition; the second
    // confirms `getAnimations()` reflects it before we wait it out.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await Promise.all(
      document.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
    );
  });
}
