import { expect, test } from "@playwright/test";

/**
 * Computed-style contrast gate for CTAs (#221).
 *
 * The home page's solid CTA buttons shipped with their label rendered in the
 * same color as their background (a 1:1 contrast ratio, invisible text): the
 * `Button` primitive renders `href` variants through the `Link` primitive,
 * `.link`'s accent color ties `.solid`'s specificity, and the production CSS
 * bundle's module order decided the winner. The axe preview gate could not
 * catch it — axe files identical-foreground-and-background text under
 * `incomplete` ("Element has a 1:1 contrast ratio with the background",
 * indistinguishable from deliberately hidden text), and the suite only
 * failed on `violations`.
 *
 * This spec runs against the local production build (same deterministic CSS
 * chunk order as the deployment), computes real `getComputedStyle` values,
 * and asserts every visible text-bearing `<a>`/`<button>` with an opaque own
 * background meets WCAG AA (>= 4.5:1) against its text color — so an
 * invisible-label CTA can never ship silently again.
 */

const THEMES = ["light", "dark"] as const;
const PAGES = ["/", "/mcp", "/experience", "/projects"] as const;

interface ContrastFinding {
  text: string;
  color: string;
  backgroundColor: string;
  ratio: number;
}

async function collectLowContrastControls(
  page: import("@playwright/test").Page,
): Promise<ContrastFinding[]> {
  return page.evaluate(() => {
    function channelToLinear(channel: number): number {
      const c = channel / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }

    function parseRgb(value: string): { r: number; g: number; b: number; a: number } | null {
      const match = value.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      if (!match) return null;
      return {
        r: Number(match[1]),
        g: Number(match[2]),
        b: Number(match[3]),
        a: match[4] === undefined ? 1 : Number(match[4]),
      };
    }

    function luminance(rgb: { r: number; g: number; b: number }): number {
      return (
        0.2126 * channelToLinear(rgb.r) +
        0.7152 * channelToLinear(rgb.g) +
        0.0722 * channelToLinear(rgb.b)
      );
    }

    function contrastRatio(
      a: { r: number; g: number; b: number },
      b: { r: number; g: number; b: number },
    ): number {
      const la = luminance(a);
      const lb = luminance(b);
      const [light, dark] = la >= lb ? [la, lb] : [lb, la];
      return (light + 0.05) / (dark + 0.05);
    }

    interface Finding {
      text: string;
      color: string;
      backgroundColor: string;
      ratio: number;
    }

    function isVisibleTextControl(element: HTMLElement, style: CSSStyleDeclaration): boolean {
      const text = element.textContent?.trim() ?? "";
      const rect = element.getBoundingClientRect();
      const hasGeometry = text.length > 0 && rect.width > 0 && rect.height > 0;
      return hasGeometry && style.visibility !== "hidden" && style.display !== "none";
    }

    function evaluateControl(element: HTMLElement): Finding | null {
      const style = getComputedStyle(element);
      if (!isVisibleTextControl(element, style)) return null;

      const bg = parseRgb(style.backgroundColor);
      const fg = parseRgb(style.color);
      // Only elements painting their own opaque background — the solid-CTA
      // case. Transparent backgrounds would need ancestor compositing and
      // are already covered by the axe violations gate.
      if (!bg || !fg || bg.a < 1) return null;

      const ratio = contrastRatio(fg, bg);
      if (ratio >= 4.5) return null;
      return {
        text: (element.textContent?.trim() ?? "").slice(0, 60),
        color: style.color,
        backgroundColor: style.backgroundColor,
        ratio: Math.round(ratio * 100) / 100,
      };
    }

    return [...document.querySelectorAll<HTMLElement>("a, button")]
      .map(evaluateControl)
      .filter((finding): finding is Finding => finding !== null);
  });
}

for (const path of PAGES) {
  for (const theme of THEMES) {
    test(`${path} — ${theme} theme — every opaque-background link/button label meets AA contrast`, async ({
      page,
    }) => {
      await page.goto(path);
      await page.evaluate((t) => {
        localStorage.setItem("theme", t);
        document.documentElement.setAttribute("data-theme", t);
      }, theme);
      await page.reload();
      await expect(page.locator("h1")).toBeVisible();
      // Colors transition (200ms) when the theme applies; computing styles
      // mid-flight reads interpolated values. Wait for every animation the
      // page knows about to settle first — same approach as the preview
      // suite's setTheme helper (#132).
      await page.evaluate(async () => {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        await new Promise((resolve) => requestAnimationFrame(resolve));
        await Promise.all(
          document.getAnimations().map((animation) => animation.finished.catch(() => undefined)),
        );
      });

      const findings = await collectLowContrastControls(page);

      expect(
        findings,
        findings
          .map(
            (finding) =>
              `"${finding.text}": ${finding.color} on ${finding.backgroundColor} = ${finding.ratio}:1`,
          )
          .join("\n"),
      ).toEqual([]);
    });
  }
}
