import { describe, expect, it } from "vitest";
import { profileSchema } from "./profile.js";

const validProfile = {
  id: "profile-marcos",
  name: "Marcos Example",
  headline: "Senior Full-Stack Engineer",
  location: "Bogotá, Colombia",
  availability: "open",
  summary: "Builds typed, tested full-stack systems.",
  contacts: [{ label: "Website", url: "https://example.test" }],
};

describe("profileSchema", () => {
  it("accepts a complete valid profile", () => {
    expect(profileSchema.safeParse(validProfile).success).toBe(true);
  });

  it("rejects a profile missing an id", () => {
    const { id: _id, ...withoutId } = validProfile;
    expect(profileSchema.safeParse(withoutId).success).toBe(false);
  });

  it("rejects an availability value outside the known set", () => {
    const result = profileSchema.safeParse({ ...validProfile, availability: "maybe" });
    expect(result.success).toBe(false);
  });

  it("rejects a profile with an empty contacts array", () => {
    const result = profileSchema.safeParse({ ...validProfile, contacts: [] });
    expect(result.success).toBe(false);
  });

  it("rejects a contact with a non-URL value", () => {
    const result = profileSchema.safeParse({
      ...validProfile,
      contacts: [{ label: "Website", url: "not-a-url" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a profile with an empty headline", () => {
    const result = profileSchema.safeParse({ ...validProfile, headline: "" });
    expect(result.success).toBe(false);
  });
});
