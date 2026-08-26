import type { Page } from "@playwright/test";
import {
  CHAT_TEST_SCENARIO_HEADER,
  CHAT_TEST_SECRET_HEADER,
  type ChatTestScenario,
} from "../../lib/chat/test-scenarios";
import { bypassHeaders, bypassSecret } from "./bypass";

/**
 * Asks the deployed `/api/chat` for a scripted, model-free turn (#264).
 *
 * The header names and scenario names are imported from the server module
 * that defines them (`apps/web/lib/chat/test-scenarios.ts`) rather than
 * re-typed here, so the wire contract cannot drift between the two sides.
 *
 * `page.setExtraHTTPHeaders` rather than `page.route`: the chat response is
 * a live SSE stream the widget renders incrementally, and interposing a
 * route handler risks buffering it — which would quietly destroy the very
 * streaming behaviour these specs assert on. Setting headers changes no
 * timing at all.
 *
 * The secret is the deployment's `VERCEL_AUTOMATION_BYPASS_SECRET`, which
 * this suite already holds for Deployment Protection — no new credential.
 * When it is absent the scripted path cannot be reached, and this throws
 * rather than falling back to a live model call: the required gate must
 * fail loudly if its assertions cannot run, never pass on a technicality.
 */
export async function useScriptedChat(page: Page, scenario: ChatTestScenario): Promise<void> {
  const secret = bypassSecret();
  if (secret === undefined) {
    throw new Error(
      "The deterministic chat specs need VERCEL_AUTOMATION_BYPASS_SECRET — it is the credential " +
        "that unlocks the scripted, model-free /api/chat path (#264). In CI the preview-e2e job " +
        "provides it. Locally, start the target build with the same value, e.g.:\n" +
        "  VERCEL_AUTOMATION_BYPASS_SECRET=local pnpm --filter @hire-me-mcp/web start\n" +
        "  BASE_URL=http://127.0.0.1:3100 VERCEL_AUTOMATION_BYPASS_SECRET=local pnpm test:e2e:preview",
    );
  }
  await page.setExtraHTTPHeaders({
    ...bypassHeaders(),
    [CHAT_TEST_SCENARIO_HEADER]: scenario,
    [CHAT_TEST_SECRET_HEADER]: secret,
  });
}
