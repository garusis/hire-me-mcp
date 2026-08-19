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
  });

  it("re-exports the shared id and entity-type schemas", () => {
    expect(schemas.idSchema).toBeDefined();
    expect(schemas.citableEntityTypeSchema).toBeDefined();
  });
});
