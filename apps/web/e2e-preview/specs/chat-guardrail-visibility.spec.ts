import { expect, test } from "../helpers/fixtures";

/**
 * Guardrail-visibility chat flow (#73): hitting a conversation/rate limit
 * renders the honest, guardrail-specific limit message to the user — not a
 * generic fallback, and not a silently swallowed error.
 *
 * Route-STUBBED (`page.route`), not a real guardrail trip: the real
 * per-session/per-IP limits (#68, `apps/web/lib/chat/rate-limit.ts`) need
 * 20-40 real requests in a 5-minute window to trip, which would burn real
 * chat/model quota just to exercise UI rendering — the issue's own scope
 * explicitly allows this ("may stub the server response"). The stubbed
 * body below is byte-for-byte what the REAL server produces for this case:
 * `apps/web/lib/chat/rate-limit-response.ts`'s
 * `buildChatRateLimitExceededResponse("session_rate_limited", ...)`, which
 * serializes `error-codes.ts`'s `buildChatErrorPayload("session_rate_limited")`
 * as a 429 JSON body — so this spec is exercising the real client-side
 * parsing/rendering path (`apps/web/app/chat/chat-error-messages.ts`) end
 * to end, only the network layer is faked.
 *
 * This also regression-tests the #73 fix in `chat-error-messages.ts`:
 * before that fix, `parseChatErrorText` didn't unwrap this nested
 * `{ error: { code, message } } }` shape and every guardrail 4xx rendered
 * the generic "Something went wrong" fallback instead of this honest,
 * specific message.
 */

const SESSION_RATE_LIMIT_BODY = {
  error: {
    code: "session_rate_limited",
    message: "You've hit the message limit for this session. Please wait and try again.",
  },
};

test("guardrail visibility: a session-rate-limit response renders the honest limit message", async ({
  gotoRoute,
  page,
}) => {
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({
      status: 429,
      contentType: "application/json",
      headers: { "Retry-After": "60" },
      body: JSON.stringify(SESSION_RATE_LIMIT_BODY),
    });
  });

  await gotoRoute("/");
  await page.getByRole("button", { name: "Ask about Marcos" }).click();
  await page
    .getByRole("button", { name: "What did Marcos build at House Numbers?", exact: true })
    .click();

  // Scoped to the chat panel: Next.js's own route-announcer
  // (`#__next-route-announcer__`) also carries `role="alert"` globally, so
  // an unscoped `page.getByRole("alert")` resolves to two elements.
  const chatPanel = page.getByRole("region", { name: "Chat with the interview agent" });
  const banner = chatPanel.getByRole("alert");
  await expect(banner).toBeVisible();
  // The banner renders the CLIENT's own fixed, honest copy for this code
  // (`chat-error-messages.ts`'s `CHAT_ERROR_MESSAGES.session_rate_limited`)
  // — never the raw server message text verbatim, per that module's "never
  // derived from the triggering input" trust-boundary design.
  await expect(banner).toContainText("Message limit reached for this session");
  await expect(banner).toContainText(
    "You've hit the message limit for this session. Wait a moment, then try again.",
  );

  // A non-retryable-shaped guardrail (message/conversation-size caps)
  // must NOT offer a "Try again" control that would just retrip the same
  // limit — session_rate_limited IS retryable, so the control should be
  // present here; the negative case is covered implicitly by
  // chat-error-messages.test.ts's retryable assertions per code.
  await expect(banner.getByRole("button", { name: "Try again" })).toBeVisible();
});

const CONVERSATION_SIZE_EXCEEDED_BODY = {
  error: {
    code: "conversation_size_exceeded",
    message: "This conversation has reached its maximum total size.",
  },
};

test("guardrail visibility: a conversation-size-exceeded response renders its honest, non-retryable message", async ({
  gotoRoute,
  page,
}) => {
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify(CONVERSATION_SIZE_EXCEEDED_BODY),
    });
  });

  await gotoRoute("/");
  await page.getByRole("button", { name: "Ask about Marcos" }).click();
  await page
    .getByRole("button", { name: "What did Marcos build at House Numbers?", exact: true })
    .click();

  const chatPanel = page.getByRole("region", { name: "Chat with the interview agent" });
  const banner = chatPanel.getByRole("alert");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("This conversation has run long");

  // conversation_size_exceeded is not retryable (retrying sends the same
  // over-cap conversation again) — the UI must not offer a "Try again"
  // control that would just fail the same way.
  await expect(banner.getByRole("button", { name: "Try again" })).toHaveCount(0);
});
