import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { chatRequestSchema } from "../../lib/chat/request-schema";
import { toRequestMessages } from "./to-request-messages";

const SESSION_ID = "6f9619ff-8b86-4d01-b42d-00cf4fc964ff";

/**
 * A realistic second-turn history exactly as `useChat` replays it (issue 222):
 * the prior assistant turn carries `step-start` and `tool-*` parts
 * alongside its text — the shape captured in the issue's failing request
 * body.
 */
function twoTurnHistoryWithToolParts(): UIMessage[] {
  return [
    {
      id: "user-1",
      role: "user",
      parts: [{ type: "text", text: "Is Marcos available now, and where is he based?" }],
    },
    {
      id: "assistant-1",
      role: "assistant",
      parts: [
        { type: "step-start" },
        {
          type: "tool-get-profile",
          toolCallId: "call-1",
          state: "output-available",
          input: {},
          output: { location: "Colombia" },
        },
        { type: "step-start" },
        { type: "text", text: "Yes — he is available and based in Colombia." },
      ],
    },
    {
      id: "user-2",
      role: "user",
      parts: [{ type: "text", text: "Does Marcos have production Go experience?" }],
    },
  ] as unknown as UIMessage[];
}

describe("toRequestMessages (issue 222)", () => {
  it("reproduces the bug: the raw useChat history is rejected by the endpoint schema", () => {
    // Documents the root cause — without sanitizing, the replayed
    // step-start/tool-* parts fail the text-only schema, which is the
    // deterministic HTTP 400 every second message hit.
    const raw = chatRequestSchema.safeParse({
      sessionId: SESSION_ID,
      messages: twoTurnHistoryWithToolParts(),
    });
    expect(raw.success).toBe(false);
  });

  it("regression: a sanitized two-turn conversation passes the endpoint schema", () => {
    const sanitized = chatRequestSchema.safeParse({
      sessionId: SESSION_ID,
      messages: toRequestMessages(twoTurnHistoryWithToolParts()),
    });
    expect(sanitized.success).toBe(true);
  });

  it("keeps only non-empty text parts, preserving message ids, roles and order", () => {
    const result = toRequestMessages(twoTurnHistoryWithToolParts());
    expect(result).toEqual([
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Is Marcos available now, and where is he based?" }],
      },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [{ type: "text", text: "Yes — he is available and based in Colombia." }],
      },
      {
        id: "user-2",
        role: "user",
        parts: [{ type: "text", text: "Does Marcos have production Go experience?" }],
      },
    ]);
  });

  it("drops a message left with no text at all (tool-only assistant turn), and system roles", () => {
    const messages = [
      { id: "sys-1", role: "system", parts: [{ type: "text", text: "be nice" }] },
      {
        id: "assistant-tools-only",
        role: "assistant",
        parts: [
          { type: "step-start" },
          { type: "tool-get-profile", toolCallId: "c1", state: "output-available" },
          { type: "text", text: "" },
        ],
      },
      { id: "user-1", role: "user", parts: [{ type: "text", text: "Hi" }] },
    ] as unknown as UIMessage[];

    expect(toRequestMessages(messages)).toEqual([
      { id: "user-1", role: "user", parts: [{ type: "text", text: "Hi" }] },
    ]);
  });
});
