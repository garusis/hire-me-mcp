import { describe, expect, it } from "vitest";
import { applyEditToolInput } from "./applyEdit.js";

describe("applyEditToolInput", () => {
  it("Write: returns the new content verbatim", () => {
    const result = applyEditToolInput("old", "Write", { content: "brand new" });
    expect(result).toBe("brand new");
  });

  it("Write: falls back to oldContent if content is missing", () => {
    const result = applyEditToolInput("old", "Write", {});
    expect(result).toBe("old");
  });

  it("Edit: replaces the first occurrence of old_string", () => {
    const result = applyEditToolInput("a b a", "Edit", { old_string: "a", new_string: "x" });
    expect(result).toBe("x b a");
  });

  it("Edit: replaces all occurrences when replace_all is true", () => {
    const result = applyEditToolInput("a b a", "Edit", {
      old_string: "a",
      new_string: "x",
      replace_all: true,
    });
    expect(result).toBe("x b x");
  });

  it("Edit: leaves content unchanged if old_string is not found", () => {
    const result = applyEditToolInput("a b c", "Edit", { old_string: "z", new_string: "x" });
    expect(result).toBe("a b c");
  });

  it("MultiEdit: applies each edit in order", () => {
    const result = applyEditToolInput("a b c", "MultiEdit", {
      edits: [
        { old_string: "a", new_string: "1" },
        { old_string: "c", new_string: "3" },
      ],
    });
    expect(result).toBe("1 b 3");
  });

  it("returns oldContent unchanged for an unrecognized tool", () => {
    const result = applyEditToolInput("unchanged", "SomeOtherTool", { anything: true });
    expect(result).toBe("unchanged");
  });
});
