import { describe, expect, it } from "vitest";
import { recommendationSchema } from "./recommendation.js";

const validRecommendation = {
  id: "recommendation-jane-doe-2026",
  recommenderName: "Jane Doe",
  recommenderTitle: "CTO at Acme Corp",
  relationship: "Jane was Marcos's direct manager",
  date: "2026-08-23",
  text: "Marcos is an excellent engineer. I would hire him again without hesitation.",
  recommenderProfileUrl: "https://www.linkedin.com/in/jane-doe/",
  sourceUrl: "https://www.linkedin.com/in/garusis/details/recommendations/?detailScreenTabIndex=0",
};

describe("recommendationSchema", () => {
  it("accepts a fully-populated recommendation", () => {
    expect(recommendationSchema.safeParse(validRecommendation).success).toBe(true);
  });

  it("rejects a non-kebab-case id", () => {
    const result = recommendationSchema.safeParse({ ...validRecommendation, id: "Not Kebab" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty recommendation text", () => {
    const result = recommendationSchema.safeParse({ ...validRecommendation, text: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a date that is not YYYY-MM-DD", () => {
    const result = recommendationSchema.safeParse({ ...validRecommendation, date: "2026-08" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-URL recommenderProfileUrl", () => {
    const result = recommendationSchema.safeParse({
      ...validRecommendation,
      recommenderProfileUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing sourceUrl — every entry must link back to LinkedIn", () => {
    const { sourceUrl: _sourceUrl, ...withoutSource } = validRecommendation;
    expect(recommendationSchema.safeParse(withoutSource).success).toBe(false);
  });

  it("rejects a missing relationship", () => {
    const { relationship: _relationship, ...withoutRelationship } = validRecommendation;
    expect(recommendationSchema.safeParse(withoutRelationship).success).toBe(false);
  });
});
