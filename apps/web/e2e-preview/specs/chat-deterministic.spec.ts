import { readChatTestCitationIds } from "../../lib/chat/test-scenario-fixture";
import { CHAT_TEST_FIXTURE_SENTINEL } from "../../lib/chat/test-scenarios";
import { CHAT_ANSWER_SELECTOR } from "../helpers/chat-answer";
import { useScriptedChat } from "../helpers/chat-scenario";
import { slugify } from "../helpers/dataset";
import { expect, test } from "../helpers/fixtures";

/**
 * The chat surface's product contract, asserted with **zero model calls**
 * (#264).
 *
 * ## Why this spec exists
 *
 * `preview-e2e` is a REQUIRED status check. Its chat coverage used to be
 * two live-model conversations, which made merging depend on a third
 * party's free-tier daily allowance: when the Preview-scoped Google project
 * hit its 500 requests/day cap, `/api/chat` returned this app's own
 * `rate_limited` envelope and both specs failed on EVERY open PR regardless
 * of content (#264: #259, #262 and #263 failed identically on the same
 * day, while production — a different Google project — answered fine).
 *
 * The tempting fix — detect "provider unavailable" and let the required
 * check pass anyway — was rejected as a merge bypass: a PR that genuinely
 * broke the chat could have its failures classified as somebody else's
 * problem and merge. So the two concerns are split instead:
 *
 * - **Here (required):** everything that actually regresses in a PR is our
 *   own code — marker-to-link rendering for every citable entity type,
 *   unlinkable types leaving no debris, the honest error copy, the
 *   multi-turn transport sanitizer (#222), streamed incremental rendering.
 *   None of it needs a real model, only a deterministic response, which
 *   `apps/web/lib/chat/test-scenarios.ts` provides behind a
 *   production-impossible gate. Quota can never make this lane red or
 *   green.
 * - **`chat-grounded.spec.ts` / `chat-gap.spec.ts` (non-required):** proof
 *   that the real provider + RAG + agent still produce grounded, cited,
 *   honest answers. There a rate-limited provider is an honest red that
 *   informs without blocking merges. See `.github/workflows/ci.yml`'s
 *   `preview-chat-live` job.
 *
 * ## The gate is asserted here too
 *
 * The last test in this file proves, on every PR, that the scripted path
 * refuses a request that does not carry the automation secret — so the
 * mechanism that makes this lane cheap cannot silently become a way to
 * script the deployed chat endpoint. Its production counterpart ("a
 * Production deployment refuses the flag outright") lives in
 * `scripts/certify-production.mjs`.
 */

/** Deterministic responses render in a beat — this is only generous enough to absorb a cold lambda. */
const SCRIPTED_TURN_TIMEOUT_MS = 30_000;

const ids = readChatTestCitationIds();

/**
 * The href each scripted marker must resolve to.
 *
 * Derived here from the entity ids and this file's OWN copy of the
 * entityType → route mapping, deliberately not by calling
 * `app/chat/resolve-chat-citation-href.ts`. If that module regressed, a
 * spec that reused it would happily assert the regression back at itself.
 */
const EXPECTED_CITATION_HREFS: ReadonlyArray<{ entityType: string; href: string }> = [
  { entityType: "experience", href: `/experience#${slugify(ids.experience)}` },
  { entityType: "project", href: `/projects/${slugify(ids.project)}` },
  { entityType: "skill", href: `/skills#${slugify(ids.skill)}` },
  { entityType: "gap", href: `/skills#gap-${slugify(ids.gap)}` },
  // Writing entries are unauthored today, so the marker's id has no entry
  // to match and the site falls back to the section index — a real page.
  { entityType: "writing", href: "/writing" },
  // #227 added the last three: `getProfile`, `listEducation`/`search-career`
  // and `listRecommendations` emit these constantly, and the resolver used
  // to return `undefined` for them, so every such citation was deleted from
  // the answer mid-sentence. They now map to real sections.
  { entityType: "profile", href: "/#profile" },
  { entityType: "education", href: `/experience#${slugify(ids.education)}` },
  { entityType: "recommendation", href: `/recommendations#${slugify(ids.recommendation)}` },
];

/**
 * Types the resolver cannot map to a site section. Empty since #227 taught
 * it every `CitableEntityType` — kept (rather than deleted) so that adding a
 * new unmappable type has an obvious place to be declared, and so the
 * no-debris assertions below keep running against whatever it holds.
 */
const UNLINKABLE_ENTITY_TYPES = [] as const;

const QUESTION = "What has Marcos actually shipped?";

async function openChatAndAsk(page: import("@playwright/test").Page): Promise<void> {
  await page.getByRole("button", { name: "Ask about Marcos" }).click();
  await expect(page.getByRole("log")).toBeVisible();
  await page.getByLabel("Message").fill(QUESTION);
  await page.getByRole("button", { name: "Send", exact: true }).click();
}

function chatPanel(page: import("@playwright/test").Page) {
  // Scoped: an unscoped getByRole("alert") also matches Next.js's own
  // always-present route announcer.
  return page.getByRole("region", { name: "Chat with the interview agent" });
}

test("scripted answer: every citable entity type renders as the link it should, and the unlinkable ones leave no debris", async ({
  gotoRoute,
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(SCRIPTED_TURN_TIMEOUT_MS * 3);
  await useScriptedChat(page, "grounded-citations");
  await gotoRoute("/");
  await openChatAndAsk(page);

  const assistantMessage = page.getByRole("log").locator('[data-role="assistant"]').last();
  // The sentinel is a phrase no live model answer could produce — if the
  // scripted path ever stopped engaging, this fails rather than silently
  // grading a real answer.
  await expect(assistantMessage).toContainText(CHAT_TEST_FIXTURE_SENTINEL, {
    timeout: SCRIPTED_TURN_TIMEOUT_MS,
  });

  // Every distinct href the rendered message links to. Deduplicated because
  // a message may legitimately repeat a source (e.g. in a "Sources" list as
  // well as inline) — what matters is the SET of targets.
  const renderedHrefs = new Set(
    await assistantMessage
      .locator("a")
      .evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute("href") ?? "")),
  );

  for (const { entityType, href } of EXPECTED_CITATION_HREFS) {
    expect(
      renderedHrefs.has(href),
      `a ${entityType} citation should link to ${href}; rendered links were ${JSON.stringify([...renderedHrefs])}`,
    ).toBe(true);
  }
  // Exactly the linkable types and nothing else: an unlinkable marker
  // silently degrading to a home-page link would be a dishonest citation.
  expect([...renderedHrefs].sort()).toEqual(
    EXPECTED_CITATION_HREFS.map((expected) => expected.href).sort(),
  );

  const answerText = await assistantMessage.innerText();
  for (const entityType of UNLINKABLE_ENTITY_TYPES) {
    expect(
      answerText,
      `an unlinkable ${entityType} citation must be dropped, never printed as raw marker syntax`,
    ).not.toContain(`[cite:${entityType}:`);
  }
  // Removing a marker must not strand the space that preceded it (#227's
  // visible symptom: a sentence ending " ."), nor the space in front of the
  // punctuation that follows it (#277's "costs ¹ . He also built").
  expect(answerText, `stray citation gap in: "${answerText}"`).not.toMatch(/ [.,]/);

  // #270: the scripted answer contains `[cite:get-skill-evidence:<id>]` — a
  // TOOL's name where an entity type belongs, exactly what the live model
  // wrote. No marker syntax of ANY shape may survive into the prose.
  expect(answerText, `raw marker syntax reached the reader in: "${answerText}"`).not.toContain(
    "[cite:",
  );
  expect(answerText).not.toContain("get-skill-evidence");
  // …and it is not silently deleted either: the DOM keeps the evidence.
  await expect(assistantMessage.locator("[data-unresolved-citation]")).toHaveCount(1);

  // #272: the answer's Markdown is rendered, not printed. The fixture's last
  // paragraph is a two-item bulleted list with bold, emphasis and code.
  const answerBody = assistantMessage.locator(CHAT_ANSWER_SELECTOR);
  await expect(answerBody.locator("ul li")).toHaveCount(2);
  await expect(answerBody.locator("strong")).toHaveCount(2);
  await expect(answerBody.locator("em")).toHaveCount(1);
  await expect(answerBody.locator("code")).toHaveCount(1);
  expect(answerText, `unrendered Markdown in: "${answerText}"`).not.toContain("**");
  expect(answerText, `unrendered bullet syntax in: "${answerText}"`).not.toMatch(/^\s*\* /m);

  // Each citation target must really exist — a link that 404s is a
  // dishonest citation, not a rendering detail.
  const fragmentsByPath = new Map<string, string[]>();
  for (const { href } of EXPECTED_CITATION_HREFS) {
    const [path, fragment] = href.split("#");
    const targetPath = path || "/";
    const response = await request.get(`${baseURL}${targetPath}`);
    expect(response.ok(), `citation target ${targetPath} did not load (${response.status()})`).toBe(
      true,
    );
    if (fragment) {
      fragmentsByPath.set(targetPath, [...(fragmentsByPath.get(targetPath) ?? []), fragment]);
    }
  }
  for (const [path, fragments] of fragmentsByPath) {
    await gotoRoute(path);
    for (const fragment of fragments) {
      await expect(
        page.locator(`#${fragment}`),
        `${path}#${fragment} does not exist on the rendered page`,
      ).toBeVisible();
    }
  }
});

test("scripted provider failure: the rate_limited envelope renders the honest, retryable message (#264's real-world payload)", async ({
  gotoRoute,
  page,
}) => {
  test.setTimeout(SCRIPTED_TURN_TIMEOUT_MS * 2);
  await useScriptedChat(page, "provider-rate-limited");
  await gotoRoute("/");
  await openChatAndAsk(page);

  const banner = chatPanel(page).getByRole("alert");
  await expect(banner).toBeVisible({ timeout: SCRIPTED_TURN_TIMEOUT_MS });
  // The client's own fixed copy for the `rate_limited` code
  // (`app/chat/chat-error-messages.ts`) — never the server's message text
  // verbatim, per that module's trust-boundary design.
  await expect(banner).toContainText("Too many messages right now");
  // A provider rate limit IS worth retrying, so the control must be offered.
  await expect(banner.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("scripted second turn succeeds: the replayed tool parts are sanitized before they are sent (#222)", async ({
  gotoRoute,
  page,
}) => {
  test.setTimeout(SCRIPTED_TURN_TIMEOUT_MS * 3);
  await useScriptedChat(page, "grounded-citations");
  await gotoRoute("/");
  await openChatAndAsk(page);

  const log = page.getByRole("log");
  await expect(log.locator('[data-role="assistant"]').first()).toContainText(
    CHAT_TEST_FIXTURE_SENTINEL,
    { timeout: SCRIPTED_TURN_TIMEOUT_MS },
  );

  // The first scripted turn carries a completed tool step. `useChat` replays
  // those parts on the next request, and sending them verbatim is exactly
  // what #222 regressed on — a 400 `invalid_request` that made the chat
  // single-turn. The server-side request schema still runs for a scripted
  // turn, so this is a real regression test, for zero model spend.
  const chatInput = page.getByLabel("Message");
  await expect(chatInput).toBeEnabled({ timeout: SCRIPTED_TURN_TIMEOUT_MS });
  await chatInput.fill("And what about the gaps?");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  const secondAnswer = log.locator('[data-role="assistant"]').nth(1);
  await expect(secondAnswer).toContainText(CHAT_TEST_FIXTURE_SENTINEL, {
    timeout: SCRIPTED_TURN_TIMEOUT_MS,
  });
  await expect(chatInput).toBeEnabled({ timeout: SCRIPTED_TURN_TIMEOUT_MS });
  await expect(chatPanel(page).getByRole("alert")).toHaveCount(0);
});

test("scripted multi-turn: every question scrolls its own turn into view (#271)", async ({
  gotoRoute,
  page,
}) => {
  test.setTimeout(SCRIPTED_TURN_TIMEOUT_MS * 4);
  await useScriptedChat(page, "grounded-citations");
  await gotoRoute("/");
  await openChatAndAsk(page);

  const log = page.getByRole("log");
  const chatInput = page.getByLabel("Message");
  const send = page.getByRole("button", { name: "Send", exact: true });

  await expect(log.locator('[data-role="assistant"]').first()).toContainText(
    CHAT_TEST_FIXTURE_SENTINEL,
    { timeout: SCRIPTED_TURN_TIMEOUT_MS },
  );

  // From the second question onward the transcript overflows its container.
  // #271: nothing moved it, so a submitted question produced no visible
  // change at all — no new bubble, no "Thinking…", nothing — and a tester
  // who knew the chat worked still concluded it had swallowed the question.
  for (const question of ["And what did he do before that role?", "Anything else?"]) {
    await expect(chatInput).toBeEnabled({ timeout: SCRIPTED_TURN_TIMEOUT_MS });
    await chatInput.fill(question);
    await send.click();

    const ownBubble = log.locator('[data-role="user"]').last();
    await expect(ownBubble).toHaveText(new RegExp(question.slice(0, 20).replace(/[?]/g, "\\?")));
    await expect(
      ownBubble,
      "the question just asked must be visible without scrolling — that is the whole of #271",
    ).toBeInViewport({ timeout: SCRIPTED_TURN_TIMEOUT_MS });

    const answer = log.locator('[data-role="assistant"]').last();
    await expect(answer).toContainText(CHAT_TEST_FIXTURE_SENTINEL, {
      timeout: SCRIPTED_TURN_TIMEOUT_MS,
    });
    await expect(
      answer.locator(CHAT_ANSWER_SELECTOR),
      "the answer must follow into view as it streams",
    ).toBeInViewport({ timeout: SCRIPTED_TURN_TIMEOUT_MS });
  }

  await expect(chatPanel(page).getByRole("alert")).toHaveCount(0);
});

test("the scripted path refuses a request that does not prove it is the automation client", async ({
  request,
  baseURL,
}) => {
  const body = {
    sessionId: crypto.randomUUID(),
    messages: [
      { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text: QUESTION }] },
    ],
  };

  // The `request` fixture carries the Deployment Protection bypass header
  // (config-level `extraHTTPHeaders`) but NOT the chat scenario secret — so
  // these requests reach the app exactly as an outside caller's would.
  for (const [label, headers] of [
    ["no secret", { "x-chat-test-scenario": "grounded-citations" }],
    [
      "wrong secret",
      { "x-chat-test-scenario": "grounded-citations", "x-chat-test-secret": "not-the-secret" },
    ],
    [
      "unknown scenario",
      { "x-chat-test-scenario": "../../etc/passwd", "x-chat-test-secret": "not-the-secret" },
    ],
  ] as const) {
    const response = await request.post(`${baseURL}/api/chat`, { headers, data: body });
    expect(response.status(), `a "${label}" scripted request must be refused`).toBe(400);
    const payload = (await response.json()) as { error?: { code?: string } };
    expect(payload.error?.code, `a "${label}" scripted request must be refused`).toBe(
      "invalid_request",
    );
  }
});
