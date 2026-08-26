import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { idSchema } from "../schemas/index.js";
import { validateContentDir } from "./loader.js";

/**
 * Invariant tests over the real, authored `content/recommendations/*.json`
 * entries (#190) — the recommendations Marcos has received on LinkedIn,
 * stored verbatim, each linking back to the recommender's profile and the
 * recommendations section of Marcos's profile (LinkedIn exposes no
 * per-recommendation permalinks).
 */
const contentDir = fileURLToPath(new URL("../../content/", import.meta.url));
const recommendationsDir = path.join(contentDir, "recommendations");

const RECOMMENDATIONS_SECTION_URL =
  "https://www.linkedin.com/in/garusis/details/recommendations/?detailScreenTabIndex=0";

interface RecommendationRecord {
  id: string;
  recommenderName: string;
  recommenderTitle: string;
  relationship: string;
  date: string;
  text: string;
  recommenderProfileUrl: string;
  sourceUrl: string;
}

function readRecommendations(): RecommendationRecord[] {
  return fs
    .readdirSync(recommendationsDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => JSON.parse(fs.readFileSync(path.join(recommendationsDir, file), "utf-8")));
}

describe("real content: recommendations/*.json", () => {
  it("validates every recommendation file against the Recommendation schema", () => {
    const errors = validateContentDir(contentDir).filter((error) =>
      error.file.startsWith("recommendations/"),
    );
    expect(errors).toEqual([]);
  });

  it("has all eight recommendations from the LinkedIn profile, none silently dropped", () => {
    const expected = [
      { recommenderName: "Jeff Levinsohn", date: "2026-08-23" },
      { recommenderName: "André Treib", date: "2026-08-19" },
      { recommenderName: "Crystal Butman", date: "2026-08-13" },
      { recommenderName: "Stojan Ilic", date: "2022-03-15" },
      { recommenderName: "Charly Palencia Yejas", date: "2022-03-08" },
      { recommenderName: "Camilo Andres Gutierrez Velasquez", date: "2022-03-04" },
      { recommenderName: "Igor Marini", date: "2021-10-26" },
      { recommenderName: "Daniel Obara", date: "2021-08-25" },
    ];
    const actual = readRecommendations().map(({ recommenderName, date }) => ({
      recommenderName,
      date,
    }));
    expect(actual).toHaveLength(expected.length);
    for (const entry of expected) {
      expect(actual).toContainEqual(entry);
    }
  });

  it("every entry points its sourceUrl at the recommendations section of Marcos's profile", () => {
    for (const entry of readRecommendations()) {
      expect(entry.sourceUrl).toBe(RECOMMENDATIONS_SECTION_URL);
    }
  });

  it("every entry's recommenderProfileUrl is a linkedin.com/in/ profile URL", () => {
    for (const entry of readRecommendations()) {
      expect(entry.recommenderProfileUrl).toMatch(/^https:\/\/www\.linkedin\.com\/in\//);
    }
  });

  it("every entry carries a non-empty relationship and verbatim text", () => {
    for (const entry of readRecommendations()) {
      expect(entry.relationship.length).toBeGreaterThan(0);
      expect(entry.text.length).toBeGreaterThan(0);
    }
  });

  it("has ids matching the documented slug pattern, unique across all entries", () => {
    const ids = readRecommendations().map((entry) => entry.id);
    for (const id of ids) {
      expect(idSchema.safeParse(id).success).toBe(true);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});
