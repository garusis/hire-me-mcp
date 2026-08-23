import {
  QUESTION_THEMES,
  RETENTION_WINDOW_DAYS,
  SURFACES,
  TOOL_OUTCOMES,
} from "@hire-me-mcp/core/analytics";
import { describe, expect, it } from "vitest";
import { buildPrivacyContent } from "./privacy-content";

describe("buildPrivacyContent", () => {
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
});
