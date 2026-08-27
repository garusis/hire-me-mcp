import { describe, expect, it } from "vitest";
import { z } from "zod";
import { dataCitationSchema, envelopeCitationSchema, toolSuccessSchema } from "./wire-schemas.js";

describe("envelopeCitationSchema", () => {
  it("accepts an enriched citation carrying a url, and rejects one without", () => {
    const enriched = {
      entityType: "experience",
      entityId: "acme-role",
      label: "Role, Acme",
      url: "http://localhost:3000/experience#acme-role",
    };
    expect(envelopeCitationSchema.safeParse(enriched).success).toBe(true);
    const { url: _url, ...withoutUrl } = enriched;
    expect(envelopeCitationSchema.safeParse(withoutUrl).success).toBe(false);
  });

  it("accepts an optional fragment", () => {
    expect(
      envelopeCitationSchema.safeParse({
        entityType: "skill",
        entityId: "typescript",
        label: "TypeScript",
        fragment: "evidence.0",
        url: "http://localhost:3000/skills#typescript",
      }).success,
    ).toBe(true);
  });
});

describe("dataCitationSchema", () => {
  it("accepts a citation with or without a url (in-data citations are not envelope-enriched)", () => {
    const base = { entityType: "gap", entityId: "dotnet", label: ".NET" };
    expect(dataCitationSchema.safeParse(base).success).toBe(true);
    expect(dataCitationSchema.safeParse({ ...base, url: "https://example.com" }).success).toBe(
      true,
    );
  });
});

describe("toolSuccessSchema", () => {
  it("wraps a data schema into the shared { data, citations } envelope shape", () => {
    const schema = toolSuccessSchema(z.string());
    const good = {
      data: "pong",
      citations: [],
    };
    expect(schema.safeParse(good).success).toBe(true);
    expect(schema.safeParse({ data: 42, citations: [] }).success).toBe(false);
    expect(schema.safeParse({ data: "pong" }).success).toBe(false);
  });

  it("validates envelope citations as url-carrying", () => {
    const schema = toolSuccessSchema(z.null());
    const withUrl = {
      data: null,
      citations: [
        {
          entityType: "project",
          entityId: "cowork",
          label: "cowork",
          url: "https://github.com/garusis/cowork",
        },
      ],
    };
    expect(schema.safeParse(withUrl).success).toBe(true);
    const withoutUrl = {
      data: null,
      citations: [{ entityType: "project", entityId: "cowork", label: "cowork" }],
    };
    expect(schema.safeParse(withoutUrl).success).toBe(false);
  });
});
