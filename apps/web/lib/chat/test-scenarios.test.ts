import { describe, expect, it } from "vitest";
import {
  CHAT_TEST_FIXTURE_SENTINEL,
  CHAT_TEST_SCENARIO_HEADER,
  CHAT_TEST_SECRET_HEADER,
  type ChatTestCitationIds,
  type ChatTestScenarioEnv,
  resolveChatTestScenario,
  scriptedAnswerText,
  scriptedChatChunks,
} from "./test-scenarios";

const SECRET = "automation-secret-value";

const PREVIEW_ENV: ChatTestScenarioEnv = { vercelEnv: "preview", automationSecret: SECRET };

const IDS: ChatTestCitationIds = {
  experience: "acme-corp",
  project: "some-project",
  skill: "typescript",
  gap: "golang",
  writing: "a-post",
  profile: "marcos",
  education: "a-degree",
  recommendation: "a-recommendation",
};

function headers(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

describe("resolveChatTestScenario", () => {
  it("is absent — the real agent runs — when no scenario header is present", () => {
    expect(resolveChatTestScenario(headers({}), PREVIEW_ENV)).toEqual({ outcome: "absent" });
  });

  it("serves the scripted scenario on a non-production deployment with the right secret", () => {
    const resolution = resolveChatTestScenario(
      headers({
        [CHAT_TEST_SCENARIO_HEADER]: "grounded-citations",
        [CHAT_TEST_SECRET_HEADER]: SECRET,
      }),
      PREVIEW_ENV,
    );
    expect(resolution).toEqual({ outcome: "scripted", scenario: "grounded-citations" });
  });

  it("rejects — never falls through to the live model — in production, secret or not", () => {
    const resolution = resolveChatTestScenario(
      headers({
        [CHAT_TEST_SCENARIO_HEADER]: "grounded-citations",
        [CHAT_TEST_SECRET_HEADER]: SECRET,
      }),
      { vercelEnv: "production", automationSecret: SECRET },
    );
    expect(resolution).toEqual({
      outcome: "rejected",
      reason: "scripted chat scenarios are disabled in production",
    });
  });

  it("rejects when the automation secret header is missing", () => {
    const resolution = resolveChatTestScenario(
      headers({ [CHAT_TEST_SCENARIO_HEADER]: "grounded-citations" }),
      PREVIEW_ENV,
    );
    expect(resolution).toEqual({
      outcome: "rejected",
      reason: "missing or invalid automation secret",
    });
  });

  it("rejects a wrong secret, including one that is merely a prefix of the real one", () => {
    for (const wrong of ["nope", SECRET.slice(0, -1), `${SECRET}x`]) {
      expect(
        resolveChatTestScenario(
          headers({
            [CHAT_TEST_SCENARIO_HEADER]: "grounded-citations",
            [CHAT_TEST_SECRET_HEADER]: wrong,
          }),
          PREVIEW_ENV,
        ),
      ).toEqual({ outcome: "rejected", reason: "missing or invalid automation secret" });
    }
  });

  it("rejects when the deployment has no automation secret configured at all", () => {
    const resolution = resolveChatTestScenario(
      headers({
        [CHAT_TEST_SCENARIO_HEADER]: "grounded-citations",
        [CHAT_TEST_SECRET_HEADER]: SECRET,
      }),
      { vercelEnv: "preview", automationSecret: undefined },
    );
    expect(resolution).toEqual({
      outcome: "rejected",
      reason: "this deployment has no automation secret configured",
    });
  });

  it("rejects an unknown scenario name even when fully authorized", () => {
    const resolution = resolveChatTestScenario(
      headers({
        [CHAT_TEST_SCENARIO_HEADER]: "drop-tables",
        [CHAT_TEST_SECRET_HEADER]: SECRET,
      }),
      PREVIEW_ENV,
    );
    expect(resolution).toEqual({
      outcome: "rejected",
      reason: 'unknown scripted chat scenario "drop-tables"',
    });
  });
});

describe("scriptedAnswerText", () => {
  const text = scriptedAnswerText(IDS);

  it("cites every citable entity type, so the rendering contract is exercised end to end", () => {
    for (const [entityType, entityId] of Object.entries(IDS)) {
      expect(text).toContain(`[cite:${entityType}:${entityId}]`);
    }
  });

  it("carries a sentinel no live model answer could produce", () => {
    expect(text).toContain(CHAT_TEST_FIXTURE_SENTINEL);
  });

  it("never places an unlinkable marker where dropping it would leave a stray gap (issue 227)", () => {
    // The three types `resolve-chat-citation-href.ts` cannot map are
    // removed from the rendered prose. Simulate that removal and assert the
    // remaining text has no orphaned space before a `.` or `,`.
    const withoutUnlinkable = text.replace(
      /\[cite:(profile|education|recommendation):[^\]]+]/g,
      "",
    );
    expect(withoutUnlinkable).not.toMatch(/ [.,]/);
  });
});

describe("scriptedChatChunks", () => {
  it("scripts a completed tool step before the answer, so the replayed history exercises #222", () => {
    const chunks = scriptedChatChunks("grounded-citations", IDS);
    const types = chunks.map((chunk) => chunk.type);
    expect(types[0]).toBe("start");
    expect(types).toContain("tool-input-available");
    expect(types).toContain("tool-output-available");
    expect(types.indexOf("tool-output-available")).toBeLessThan(types.indexOf("text-start"));
    expect(types.at(-1)).toBe("finish");
  });

  it("streams the answer as several deltas rather than one blob", () => {
    const deltas = scriptedChatChunks("grounded-citations", IDS).filter(
      (chunk) => chunk.type === "text-delta",
    );
    expect(deltas.length).toBeGreaterThan(1);
    expect(deltas.map((chunk) => (chunk as { delta: string }).delta).join("")).toBe(
      scriptedAnswerText(IDS),
    );
  });

  it("reproduces the exact rate_limited envelope the provider cap produced (#264)", () => {
    const errorChunk = scriptedChatChunks("provider-rate-limited", IDS).find(
      (chunk) => chunk.type === "error",
    );
    expect(errorChunk).toBeDefined();
    expect(JSON.parse((errorChunk as { errorText: string }).errorText)).toEqual({
      code: "rate_limited",
      message: "The model provider is rate-limiting requests right now. Please try again shortly.",
    });
  });

  it("never emits answer text for the provider-error scenario", () => {
    const types = scriptedChatChunks("provider-rate-limited", IDS).map((chunk) => chunk.type);
    expect(types).not.toContain("text-delta");
  });
});
