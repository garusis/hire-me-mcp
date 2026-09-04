import { describe, expect, it } from "vitest";
import * as schemas from "./index.js";

describe("schemas barrel", () => {
  it("re-exports every entity schema", () => {
    expect(schemas.citationSchema).toBeDefined();
    expect(schemas.profileSchema).toBeDefined();
    expect(schemas.experienceEntrySchema).toBeDefined();
    expect(schemas.projectSchema).toBeDefined();
    expect(schemas.skillSchema).toBeDefined();
    expect(schemas.gapSchema).toBeDefined();
    expect(schemas.educationEntrySchema).toBeDefined();
    expect(schemas.writingEntrySchema).toBeDefined();
    expect(schemas.recommendationSchema).toBeDefined();
    expect(schemas.careerStorySchema).toBeDefined();
    expect(schemas.storyPreservationEntrySchema).toBeDefined();
    expect(schemas.storyPreservationMapSchema).toBeDefined();
  });

  it("re-exports the shared id and entity-type schemas", () => {
    expect(schemas.idSchema).toBeDefined();
    expect(schemas.citableEntityTypeSchema).toBeDefined();
  });

  it("re-exports the competency taxonomy as one typed source of truth (#289)", () => {
    expect(schemas.COMPETENCIES).toBeDefined();
    expect(schemas.competencySchema).toBeDefined();
    expect(schemas.isCompetency("leadership")).toBe(true);
  });

  it("re-exports the CV-only overlay schema (#309 stage 3)", () => {
    expect(schemas.cvOverridesSchema).toBeDefined();
    expect(schemas.cvVariantSchema).toBeDefined();
  });
});
