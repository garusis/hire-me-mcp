import { getProfile } from "@hire-me-mcp/core";
import { describe, expect, it } from "vitest";
import { getProfileView } from "./profile";
import { getCareerDataRepository } from "./repository";

describe("getProfileView", () => {
  it("wraps packages/core's getProfile(), passing its data through unmodified", () => {
    const expected = getProfile(getCareerDataRepository());

    const view = getProfileView();

    expect(view.profile).toEqual(expected.data);
  });

  it("passes citations from packages/core through unmodified", () => {
    const expected = getProfile(getCareerDataRepository());

    const view = getProfileView();

    expect(view.citations).toEqual(expected.citations);
  });

  it("returns exactly one citation, resolving to the profile itself", () => {
    const view = getProfileView();

    expect(view.citations).toHaveLength(1);
    expect(view.citations[0]).toMatchObject({
      entityType: "profile",
      entityId: view.profile.id,
    });
  });
});
