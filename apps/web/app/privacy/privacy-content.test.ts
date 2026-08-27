import {
  QUESTION_THEMES,
  RETENTION_WINDOW_DAYS,
  SURFACES,
  scrubQuestionEvent,
  scrubToolEvent,
  TOOL_OUTCOMES,
} from "@hire-me-mcp/core/analytics";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readChatRateLimitConfig } from "../../lib/chat/rate-limit";
import { chatRequestSchema } from "../../lib/chat/request-schema";
import { buildPrivacyContent } from "./privacy-content";

describe("buildPrivacyContent", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sources the retention window directly from the analytics module's exported constant — cannot drift (#81)", () => {
    const content = buildPrivacyContent();
    expect(content.retentionDays).toBe(RETENTION_WINDOW_DAYS);
  });

  it("sources the surface, outcome and theme taxonomies directly from the analytics module's exports", () => {
    const content = buildPrivacyContent();
    expect(content.surfaces).toEqual(SURFACES);
    expect(content.toolOutcomes).toEqual(TOOL_OUTCOMES);
    expect(content.questionThemes).toEqual(QUESTION_THEMES);
  });

  it("lists what is collected, in plain language, without hardcoding a retention number as prose", () => {
    const content = buildPrivacyContent();
    expect(content.collected.length).toBeGreaterThan(0);
    for (const item of content.collected) {
      expect(item).not.toMatch(/\b90\b/);
    }
  });

  it("lists what is never collected, including raw questions, message contents, IPs and identities", () => {
    const content = buildPrivacyContent();
    const joined = content.neverCollected.join(" ").toLowerCase();
    expect(joined).toMatch(/raw question/);
    expect(joined).toMatch(/message content/);
    expect(joined).toMatch(/ip address/);
    expect(joined).toMatch(/identit/);
  });

  it("names Vercel, Google Gemini, Neon and Upstash as the third-party services — no email/Resend mention (cut per #81 decision)", () => {
    const content = buildPrivacyContent();
    const names = content.thirdPartyServices.map((service) => service.name);
    expect(names).toEqual(expect.arrayContaining(["Vercel", "Google Gemini", "Neon", "Upstash"]));
    const joined = JSON.stringify(content).toLowerCase();
    expect(joined).not.toMatch(/resend/);
  });

  it("states no third-party ad/tracking cookies are used", () => {
    const content = buildPrivacyContent();
    expect(content.noTrackingCookiesStatement.toLowerCase()).toMatch(/no.*(cookie)/);
  });

  // --- Chat session identifier (issue 239) ---------------------------------
  //
  // The page used to claim session identifiers were never collected, while
  // `POST /api/chat` has always *required* one. The tests below bind the
  // corrected copy to the two real sources — the live request schema and the
  // live analytics event shape — so the claim cannot silently drift again.

  it("describes exactly the top-level fields chatRequestSchema accepts — a gained or dropped field fails here (239)", () => {
    const content = buildPrivacyContent();
    expect(content.chatRequestFields.map((field) => field.name)).toEqual(
      Object.keys(chatRequestSchema.shape),
    );
    for (const field of content.chatRequestFields) {
      expect(field.purpose.length).toBeGreaterThan(0);
    }
  });

  it("names the session identifier field as the request schema actually spells it", () => {
    const content = buildPrivacyContent();
    expect(Object.keys(chatRequestSchema.shape)).toContain(content.sessionIdentifier.fieldName);
    expect(content.sessionIdentifier.fieldName).toBe("sessionId");
  });

  it("no longer lists session identifiers among the things that are never collected", () => {
    const content = buildPrivacyContent();
    expect(content.neverCollected.join(" ").toLowerCase()).not.toMatch(/session/);
  });

  it("explains the session id as a per-conversation, browser-generated UUID with no personal data", () => {
    const prose = buildPrivacyContent().sessionIdentifier.statements.join(" ").toLowerCase();
    expect(prose).toMatch(/uuid/);
    expect(prose).toMatch(/browser/);
    expect(prose).toMatch(/conversation/);
    expect(prose).toMatch(/not an account/);
    expect(prose).toMatch(/no personal data/);
  });

  it("backs the 'never written to the usage database' claim with the real scrubbed event shape (239)", () => {
    const content = buildPrivacyContent();
    const storedFields = [
      ...Object.keys(
        scrubToolEvent({
          surface: "chat",
          toolName: "search-career",
          outcome: "success",
          latencyMs: 12,
        }),
      ),
      ...Object.keys(scrubQuestionEvent({ theme: "skills", latencyMs: 12, usedRetrieval: true })),
    ];
    // If an analytics event ever gains a session/caller column, this fails
    // before the page's "never written to the database" sentence goes stale.
    for (const field of storedFields) {
      expect(field.toLowerCase()).not.toContain("session");
    }
    expect(content.sessionIdentifier.storedWithUsageEvents).toBe(false);
    expect(content.sessionIdentifier.statements.join(" ").toLowerCase()).toMatch(
      /never written to (the|this site's) usage/,
    );
  });

  it("sources the session rate-limit window from the live chat rate-limit config, not a literal", () => {
    expect(buildPrivacyContent().sessionIdentifier.rateLimitWindowSeconds).toBe(
      readChatRateLimitConfig().session.windowSeconds,
    );

    vi.stubEnv("CHAT_SESSION_RATELIMIT_WINDOW_SECONDS", "600");
    const overridden = buildPrivacyContent();
    expect(overridden.sessionIdentifier.rateLimitWindowSeconds).toBe(600);
    expect(overridden.sessionIdentifier.statements.join(" ")).toContain(
      "rate-limit window (10 minutes)",
    );
  });

  it("keeps the retention window out of the session prose as a hand-typed number", () => {
    for (const statement of buildPrivacyContent().sessionIdentifier.statements) {
      expect(statement).not.toMatch(/\b90\b/);
    }
  });
});
