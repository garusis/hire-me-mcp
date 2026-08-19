import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { idSchema } from "../schemas/index.js";
import { validateContentDir } from "./loader.js";

/**
 * Invariant tests over the real, authored `content/profile.json` (#48) —
 * not the synthetic fixture under `__fixtures__/`.
 */
const contentDir = fileURLToPath(new URL("../../content/", import.meta.url));

function readProfile(): { id: string; contacts: Array<{ label: string; url: string }> } {
  const raw = fs.readFileSync(path.join(contentDir, "profile.json"), "utf-8");
  return JSON.parse(raw);
}

describe("real content: profile.json", () => {
  it("exists and validates against the Profile schema", () => {
    const errors = validateContentDir(contentDir).filter((error) => error.file === "profile.json");
    expect(errors).toEqual([]);
  });

  it("contains exactly one profile record with a slug-pattern id", () => {
    const profile = readProfile();
    expect(profile.id).toBeTruthy();
    expect(idSchema.safeParse(profile.id).success).toBe(true);
  });

  it("declares at least one public contact surface", () => {
    const profile = readProfile();
    expect(profile.contacts.length).toBeGreaterThan(0);
    for (const contact of profile.contacts) {
      expect(contact.label.length).toBeGreaterThan(0);
      expect(contact.url.length).toBeGreaterThan(0);
    }
  });

  it("does not expose a phone number in any contact url", () => {
    const profile = readProfile();
    for (const contact of profile.contacts) {
      expect(contact.url).not.toMatch(/tel:/);
    }
  });
});
