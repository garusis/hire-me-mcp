import { describe, expect, it } from "vitest";
import { CHAT_AGENT_LIMITS_DEFAULTS, readChatAgentStepLimit } from "./agent-limits";

describe("readChatAgentStepLimit", () => {
  it("defaults to the documented per-turn step cap when unset", () => {
    expect(readChatAgentStepLimit({})).toBe(CHAT_AGENT_LIMITS_DEFAULTS.maxSteps);
  });

  it("reads a CHAT_AGENT_MAX_STEPS override", () => {
    expect(readChatAgentStepLimit({ CHAT_AGENT_MAX_STEPS: "3" })).toBe(3);
  });

  it("falls back to the default for a malformed override rather than throwing", () => {
    expect(readChatAgentStepLimit({ CHAT_AGENT_MAX_STEPS: "not-a-number" })).toBe(
      CHAT_AGENT_LIMITS_DEFAULTS.maxSteps,
    );
    expect(readChatAgentStepLimit({ CHAT_AGENT_MAX_STEPS: "0" })).toBe(
      CHAT_AGENT_LIMITS_DEFAULTS.maxSteps,
    );
    expect(readChatAgentStepLimit({ CHAT_AGENT_MAX_STEPS: "-1" })).toBe(
      CHAT_AGENT_LIMITS_DEFAULTS.maxSteps,
    );
  });
});
