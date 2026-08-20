import { test as base } from "@playwright/test";
import { withBypassQuery } from "./bypass";

export interface ConsoleErrorTracker {
  /** `console.error`/`pageerror` messages observed since the tracker was created, in order. */
  errors: string[];
}

interface PreviewFixtures {
  /**
   * Navigates to `path` against the suite's `baseURL`, applying the Vercel
   * Deployment Protection bypass query params (a no-op when no bypass
   * secret is configured — see `helpers/bypass.ts`) so this is the one
   * navigation helper every spec uses, whether the target is a
   * protection-gated preview or an open local/production URL.
   */
  gotoRoute: (path: string) => ReturnType<import("@playwright/test").Page["goto"]>;
  /** Collects `console.error` and uncaught `pageerror` messages for the current page — asserted against in `navigation.spec.ts`. */
  consoleErrors: ConsoleErrorTracker;
}

export const test = base.extend<PreviewFixtures>({
  consoleErrors: async ({ page }, use) => {
    const tracker: ConsoleErrorTracker = { errors: [] };
    page.on("console", (message) => {
      if (message.type() === "error") {
        tracker.errors.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      tracker.errors.push(error.message);
    });
    await use(tracker);
  },
  gotoRoute: async ({ page }, use) => {
    await use((path: string) => page.goto(withBypassQuery(path)));
  },
});

export { expect } from "@playwright/test";
