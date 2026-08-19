import { describe, expect, it } from "vitest";
import { skillSchema } from "./skill.js";

const validSkill = {
  id: "typescript",
  name: "TypeScript",
  aliases: ["ts"],
  category: "language",
  proficiency: "expert",
  evidence: [
    {
      entityType: "experience",
      entityId: "senior-engineer-acme-2021",
      label: "Senior Engineer, Acme Corp",
    },
  ],
};

describe("skillSchema", () => {
  it("accepts a complete valid skill", () => {
    expect(skillSchema.safeParse(validSkill).success).toBe(true);
  });

  it("accepts a skill with no aliases", () => {
    expect(skillSchema.safeParse({ ...validSkill, aliases: [] }).success).toBe(true);
  });

  it("rejects a skill with no evidence citations", () => {
    const result = skillSchema.safeParse({ ...validSkill, evidence: [] });
    expect(result.success).toBe(false);
  });

  it("rejects a proficiency value outside the known set", () => {
    const result = skillSchema.safeParse({ ...validSkill, proficiency: "godlike" });
    expect(result.success).toBe(false);
  });

  it("rejects a skill with a malformed evidence citation", () => {
    const result = skillSchema.safeParse({
      ...validSkill,
      evidence: [{ entityType: "experience" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a skill missing a canonical name", () => {
    const { name: _name, ...withoutName } = validSkill;
    expect(skillSchema.safeParse(withoutName).success).toBe(false);
  });
});
