import { describe, expect, it } from "vitest";
import { gapSchema } from "./gap.js";

const validGap = {
  id: "kubernetes",
  name: "Kubernetes",
  aliases: ["k8s"],
  statement:
    "Has not run Kubernetes in production; deployed containerized services via managed PaaS instead.",
  relatedSkills: ["docker"],
};

describe("gapSchema", () => {
  it("accepts a complete valid gap", () => {
    expect(gapSchema.safeParse(validGap).success).toBe(true);
  });

  it("accepts a gap with no related skills — representable without any Skill record", () => {
    expect(gapSchema.safeParse({ ...validGap, relatedSkills: [] }).success).toBe(true);
  });

  it("rejects a gap with an empty honesty statement", () => {
    const result = gapSchema.safeParse({ ...validGap, statement: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a relatedSkills entry that is not a kebab-case id", () => {
    const result = gapSchema.safeParse({ ...validGap, relatedSkills: ["Not An Id"] });
    expect(result.success).toBe(false);
  });

  it("rejects a gap missing a canonical name", () => {
    const { name: _name, ...withoutName } = validGap;
    expect(gapSchema.safeParse(withoutName).success).toBe(false);
  });
});
