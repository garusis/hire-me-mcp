import { describe, expect, it } from "vitest";
import { createToolExecutor } from "../define-tool.js";
import { pingTool } from "./ping.js";

describe("pingTool", () => {
  it("is named ping and has a non-empty description", () => {
    expect(pingTool.name).toBe("ping");
    expect(pingTool.description.length).toBeGreaterThan(0);
  });

  it("accepts no arguments and returns a successful pong result", async () => {
    const executor = createToolExecutor(pingTool);

    const result = await executor({});

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ data: "pong", citations: [] });
  });
});
