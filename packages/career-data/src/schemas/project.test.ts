import { describe, expect, it } from "vitest";
import { projectSchema } from "./project.js";

const validProject = {
  id: "billing-rewrite",
  name: "Billing Rewrite",
  summary: "Rebuilt the billing pipeline on event sourcing.",
  role: "Tech Lead",
  tech: ["typescript", "postgres"],
  links: [{ label: "Repo", url: "https://example.test/repo" }],
  body: "## What I built\n\nA long-form write-up of the project.",
};

describe("projectSchema", () => {
  it("accepts a complete valid project", () => {
    expect(projectSchema.safeParse(validProject).success).toBe(true);
  });

  it("accepts a project with no links", () => {
    expect(projectSchema.safeParse({ ...validProject, links: [] }).success).toBe(true);
  });

  it("rejects a project with an empty body", () => {
    const result = projectSchema.safeParse({ ...validProject, body: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a project with an empty tech array", () => {
    const result = projectSchema.safeParse({ ...validProject, tech: [] });
    expect(result.success).toBe(false);
  });

  it("rejects a link with a non-URL value", () => {
    const result = projectSchema.safeParse({
      ...validProject,
      links: [{ label: "Repo", url: "not-a-url" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a project missing a name", () => {
    const { name: _name, ...withoutName } = validProject;
    expect(projectSchema.safeParse(withoutName).success).toBe(false);
  });

  describe("period (#224)", () => {
    it("accepts a project with a start-only (ongoing) period and preserves it", () => {
      const result = projectSchema.safeParse({ ...validProject, period: { start: "2026-08" } });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.period).toEqual({ start: "2026-08" });
      }
    });

    it("accepts a project with a closed period", () => {
      const result = projectSchema.safeParse({
        ...validProject,
        period: { start: "2023-01", end: "2024-06" },
      });
      expect(result.success).toBe(true);
    });

    it("accepts a project without a period (optional, stays undefined)", () => {
      const result = projectSchema.safeParse(validProject);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.period).toBeUndefined();
      }
    });

    it("rejects a period whose end is before its start", () => {
      const result = projectSchema.safeParse({
        ...validProject,
        period: { start: "2024-06", end: "2023-01" },
      });
      expect(result.success).toBe(false);
    });

    it("rejects a period with a non-YYYY-MM start", () => {
      const result = projectSchema.safeParse({ ...validProject, period: { start: "2026" } });
      expect(result.success).toBe(false);
    });
  });

  describe("featured flag (#191)", () => {
    it("accepts a project with featured: true and preserves the value", () => {
      const result = projectSchema.safeParse({ ...validProject, featured: true });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.featured).toBe(true);
      }
    });

    it("accepts a project without a featured field (optional, stays undefined)", () => {
      const result = projectSchema.safeParse(validProject);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.featured).toBeUndefined();
      }
    });

    it("rejects a non-boolean featured value", () => {
      expect(projectSchema.safeParse({ ...validProject, featured: "yes" }).success).toBe(false);
    });
  });
});
