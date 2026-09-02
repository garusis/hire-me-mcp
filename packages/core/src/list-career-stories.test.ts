import { fileURLToPath } from "node:url";
import type { CareerStory, ExperienceEntry } from "@hire-me-mcp/career-data";
import { describe, expect, it } from "vitest";
import { listCareerStories } from "./list-career-stories.js";
import {
  type CareerDataset,
  createContentCareerDataRepository,
  createInMemoryCareerDataRepository,
  emptyCareerDataset,
} from "./repository.js";

const realContentDir = fileURLToPath(new URL("../../career-data/content/", import.meta.url));

function experience(
  overrides: Partial<ExperienceEntry> & Pick<ExperienceEntry, "id" | "company">,
): ExperienceEntry {
  return {
    role: "Fixture Engineer",
    startDate: "2020-01",
    endDate: "2021-01",
    summary: "Fixture summary.",
    highlights: ["Did a fixture thing"],
    tech: ["typescript"],
    ...overrides,
  };
}

function story(
  overrides: Partial<CareerStory> & Pick<CareerStory, "id" | "experienceId" | "primaryCompetency">,
): CareerStory {
  return {
    title: `Title of ${overrides.id}`,
    supportingCompetencies: [],
    situation: "Fixture situation.",
    task: "Fixture task.",
    actions: ["Fixture action."],
    results: ["Fixture result."],
    retrievalTags: ["fixture-tag"],
    ...overrides,
  };
}

const current = experience({
  id: "current-co-2022",
  company: "Current Co",
  role: "Current Engineer",
  startDate: "2022-05",
  endDate: undefined,
});
const recent = experience({
  id: "recent-co-2020",
  company: "Recent Co",
  role: "Recent Engineer",
  startDate: "2020-12",
  endDate: "2022-03",
});
const middle = experience({
  id: "middle-co-2016",
  company: "Middle Co",
  role: "Middle Engineer",
  startDate: "2016-02",
  endDate: "2018-06",
});
const oldest = experience({
  id: "old-co-2013",
  company: "Old Co",
  role: "Old Engineer",
  startDate: "2013-02",
  endDate: "2015-06",
});

// Two stories under the same (current) parent — `id` is the final tie breaker.
const currentAlpha = story({
  id: "story-current-alpha",
  experienceId: "current-co-2022",
  primaryCompetency: "leadership",
  supportingCompetencies: ["communication"],
  retrievalTags: ["alpha-tag", "shared-tag"],
});
const currentBeta = story({
  id: "story-current-beta",
  experienceId: "current-co-2022",
  primaryCompetency: "problem-solving",
  supportingCompetencies: ["leadership"],
});
const recentLeadership = story({
  id: "story-recent-leadership",
  experienceId: "recent-co-2020",
  relatedExperienceIds: ["middle-co-2016"],
  primaryCompetency: "leadership",
  supportingCompetencies: ["stakeholder-management", "influence"],
});
const middleMentoring = story({
  id: "story-middle-mentoring",
  experienceId: "middle-co-2016",
  primaryCompetency: "mentoring",
  supportingCompetencies: ["leadership", "communication"],
});
const oldOwnership = story({
  id: "story-old-ownership",
  experienceId: "old-co-2013",
  primaryCompetency: "ownership",
});

function fixtureDataset(): CareerDataset {
  return {
    ...emptyCareerDataset(),
    experience: [current, recent, middle, oldest],
    stories: [currentAlpha, currentBeta, recentLeadership, middleMentoring, oldOwnership],
  };
}

function fixtureRepository(dataset: CareerDataset = fixtureDataset()) {
  return createInMemoryCareerDataRepository(dataset);
}

function ids(result: ReturnType<typeof listCareerStories>): string[] {
  return result.data.map((entry) => entry.story.id);
}

describe("listCareerStories", () => {
  describe("without a filter", () => {
    it("returns every story, parents most recent first, then story id ascending", () => {
      expect(ids(listCareerStories(fixtureRepository()))).toEqual([
        "story-current-alpha",
        "story-current-beta",
        "story-recent-leadership",
        "story-middle-mentoring",
        "story-old-ownership",
      ]);
    });

    it("treats an empty filter object exactly like an omitted one", () => {
      expect(ids(listCareerStories(fixtureRepository(), {}))).toEqual(
        ids(listCareerStories(fixtureRepository())),
      );
    });

    it("orders identically when the input arrays are shuffled", () => {
      const dataset = fixtureDataset();
      const shuffled = fixtureRepository({
        ...dataset,
        experience: [...dataset.experience].reverse(),
        stories: [middleMentoring, currentAlpha, oldOwnership, recentLeadership, currentBeta],
      });

      expect(listCareerStories(shuffled)).toEqual(listCareerStories(fixtureRepository()));
    });
  });

  describe("output contract", () => {
    it("returns the complete story record, including retrievalTags, with no eval-only retrieval questions", () => {
      const [entry] = listCareerStories(fixtureRepository(), { id: "story-current-alpha" }).data;

      expect(entry?.story).toEqual(currentAlpha);
      expect(entry?.story.retrievalTags).toEqual(["alpha-tag", "shared-tag"]);
      expect(entry?.story).not.toHaveProperty("retrievalQuestions");
    });

    it("carries compact primary experience context for a current parent role (no endDate, no highlights)", () => {
      const [entry] = listCareerStories(fixtureRepository(), { id: "story-current-alpha" }).data;

      expect(entry?.primaryExperience).toStrictEqual({
        id: "current-co-2022",
        company: "Current Co",
        role: "Current Engineer",
        startDate: "2022-05",
      });
      expect(entry?.relatedExperiences).toEqual([]);
    });

    it("carries compact primary experience context for a past parent role, including its endDate", () => {
      const [entry] = listCareerStories(fixtureRepository(), { id: "story-old-ownership" }).data;

      expect(entry?.primaryExperience).toStrictEqual({
        id: "old-co-2013",
        company: "Old Co",
        role: "Old Engineer",
        startDate: "2013-02",
        endDate: "2015-06",
      });
    });

    it("labels related experiences separately from the primary parent, with the same compact fields", () => {
      const [entry] = listCareerStories(fixtureRepository(), {
        id: "story-recent-leadership",
      }).data;

      expect(entry?.primaryExperience.id).toBe("recent-co-2020");
      expect(entry?.relatedExperiences).toStrictEqual([
        {
          id: "middle-co-2016",
          company: "Middle Co",
          role: "Middle Engineer",
          startDate: "2016-02",
          endDate: "2018-06",
        },
      ]);
    });

    it("attaches one story citation per entry, mirrored in the envelope's citations, with no dangling ids", () => {
      const result = listCareerStories(fixtureRepository());
      const storyIds = new Set(fixtureDataset().stories.map((s) => s.id));

      expect(result.citations).toHaveLength(result.data.length);
      result.data.forEach((entry, index) => {
        expect(entry.citation).toEqual({
          entityType: "story",
          entityId: entry.story.id,
          label: entry.story.title,
        });
        expect(result.citations[index]).toEqual(entry.citation);
        expect(storyIds.has(entry.citation.entityId)).toBe(true);
      });
    });
  });

  describe("id filter", () => {
    it("matches exactly one story by id", () => {
      expect(ids(listCareerStories(fixtureRepository(), { id: "story-middle-mentoring" }))).toEqual(
        ["story-middle-mentoring"],
      );
    });

    it("normalizes the id case-insensitively, like the company filter", () => {
      expect(
        ids(listCareerStories(fixtureRepository(), { id: "  STORY-Middle-Mentoring " })),
      ).toEqual(["story-middle-mentoring"]);
    });

    it("returns an empty result for an unknown id", () => {
      expect(listCareerStories(fixtureRepository(), { id: "nope" })).toEqual({
        data: [],
        citations: [],
      });
    });
  });

  describe("experienceId filter", () => {
    it("matches stories whose primary experience is the given id", () => {
      expect(
        ids(listCareerStories(fixtureRepository(), { experienceId: "current-co-2022" })),
      ).toEqual(["story-current-alpha", "story-current-beta"]);
    });

    it("also matches stories that list the id in relatedExperienceIds, ordered by their own parent", () => {
      expect(
        ids(listCareerStories(fixtureRepository(), { experienceId: "middle-co-2016" })),
      ).toEqual(["story-recent-leadership", "story-middle-mentoring"]);
    });

    it("is case-insensitive and returns empty for an unknown experience id", () => {
      expect(ids(listCareerStories(fixtureRepository(), { experienceId: "OLD-CO-2013" }))).toEqual([
        "story-old-ownership",
      ]);
      expect(ids(listCareerStories(fixtureRepository(), { experienceId: "ghost-co" }))).toEqual([]);
    });
  });

  describe("company filter", () => {
    it("matches the primary experience's company case-insensitively", () => {
      expect(ids(listCareerStories(fixtureRepository(), { company: "current co" }))).toEqual([
        "story-current-alpha",
        "story-current-beta",
      ]);
      expect(ids(listCareerStories(fixtureRepository(), { company: " CURRENT CO " }))).toEqual([
        "story-current-alpha",
        "story-current-beta",
      ]);
    });

    it("matches through a related experience's company as well", () => {
      expect(ids(listCareerStories(fixtureRepository(), { company: "Middle Co" }))).toEqual([
        "story-recent-leadership",
        "story-middle-mentoring",
      ]);
    });

    it("returns empty for an unknown company", () => {
      expect(ids(listCareerStories(fixtureRepository(), { company: "Nowhere Inc" }))).toEqual([]);
    });
  });

  describe("company and experienceId combined", () => {
    it("must be satisfied by the same primary-or-related association", () => {
      // story-recent-leadership is associated with Recent Co (primary) and
      // middle-co-2016 (related) — but never both on one association.
      expect(
        ids(
          listCareerStories(fixtureRepository(), {
            company: "Recent Co",
            experienceId: "middle-co-2016",
          }),
        ),
      ).toEqual([]);
    });

    it("matches when both fields describe one association, primary or related", () => {
      expect(
        ids(
          listCareerStories(fixtureRepository(), {
            company: "Middle Co",
            experienceId: "middle-co-2016",
          }),
        ),
      ).toEqual(["story-recent-leadership", "story-middle-mentoring"]);
      expect(
        ids(
          listCareerStories(fixtureRepository(), {
            company: "Recent Co",
            experienceId: "recent-co-2020",
          }),
        ),
      ).toEqual(["story-recent-leadership"]);
    });
  });

  describe("competencies filter", () => {
    it("matches on the primary competency", () => {
      expect(ids(listCareerStories(fixtureRepository(), { competencies: ["ownership"] }))).toEqual([
        "story-old-ownership",
      ]);
    });

    it("matches on a supporting competency", () => {
      expect(
        ids(listCareerStories(fixtureRepository(), { competencies: ["stakeholder-management"] })),
      ).toEqual(["story-recent-leadership"]);
    });

    it("ORs multiple competencies", () => {
      expect(
        ids(listCareerStories(fixtureRepository(), { competencies: ["ownership", "mentoring"] })),
      ).toEqual(["story-middle-mentoring", "story-old-ownership"]);
    });

    it("ranks primary-competency matches ahead of supporting-only matches, each group by parent recency then id", () => {
      expect(ids(listCareerStories(fixtureRepository(), { competencies: ["leadership"] }))).toEqual(
        [
          "story-current-alpha",
          "story-recent-leadership",
          "story-current-beta",
          "story-middle-mentoring",
        ],
      );
    });

    it("treats an empty array as no constraint, and normalizes values case-insensitively", () => {
      expect(ids(listCareerStories(fixtureRepository(), { competencies: [] }))).toEqual(
        ids(listCareerStories(fixtureRepository())),
      );
      expect(
        ids(listCareerStories(fixtureRepository(), { competencies: [" Ownership "] })),
      ).toEqual(["story-old-ownership"]);
    });

    it("returns an empty result, not an error, for a value outside the taxonomy", () => {
      expect(listCareerStories(fixtureRepository(), { competencies: ["kubernetes"] })).toEqual({
        data: [],
        citations: [],
      });
    });
  });

  describe("AND across fields", () => {
    it("requires every supplied field to match", () => {
      expect(
        ids(
          listCareerStories(fixtureRepository(), {
            competencies: ["leadership"],
            company: "Current Co",
          }),
        ),
      ).toEqual(["story-current-alpha", "story-current-beta"]);
      expect(
        ids(
          listCareerStories(fixtureRepository(), {
            competencies: ["leadership"],
            company: "Old Co",
          }),
        ),
      ).toEqual([]);
      expect(
        ids(
          listCareerStories(fixtureRepository(), {
            id: "story-recent-leadership",
            experienceId: "current-co-2022",
          }),
        ),
      ).toEqual([]);
    });
  });

  describe("missing parent defense", () => {
    it("excludes a story whose primary experience does not resolve, rather than throwing", () => {
      const dataset = fixtureDataset();
      const orphan = story({
        id: "story-orphan",
        experienceId: "ghost-co",
        primaryCompetency: "leadership",
      });
      const repository = fixtureRepository({ ...dataset, stories: [...dataset.stories, orphan] });

      expect(() => listCareerStories(repository)).not.toThrow();
      expect(ids(listCareerStories(repository))).not.toContain("story-orphan");
      expect(ids(listCareerStories(repository, { competencies: ["leadership"] }))).not.toContain(
        "story-orphan",
      );
    });

    it("drops a related experience id that does not resolve, keeping the story", () => {
      const dataset = fixtureDataset();
      const dangling = story({
        id: "story-dangling-related",
        experienceId: "old-co-2013",
        relatedExperienceIds: ["ghost-co"],
        primaryCompetency: "ownership",
      });
      const repository = fixtureRepository({ ...dataset, stories: [...dataset.stories, dangling] });

      const [entry] = listCareerStories(repository, { id: "story-dangling-related" }).data;
      expect(entry?.relatedExperiences).toEqual([]);
      expect(ids(listCareerStories(repository, { experienceId: "ghost-co" }))).toEqual([]);
    });
  });

  describe("immutability", () => {
    it("never mutates the repository's dataset, even under every filter at once", () => {
      const dataset = fixtureDataset();
      const snapshot = structuredClone(dataset);
      const repository = fixtureRepository(dataset);

      listCareerStories(repository);
      listCareerStories(repository, {
        id: "story-recent-leadership",
        experienceId: "middle-co-2016",
        company: "middle co",
        competencies: ["leadership", "influence"],
      });

      expect(dataset).toEqual(snapshot);
      expect(dataset.stories).toBe(dataset.stories);
    });
  });

  describe("against the real content directory", () => {
    const repository = createContentCareerDataRepository({ contentDir: realContentDir });

    it("returns every authored story with a resolved parent and one citation each", () => {
      const result = listCareerStories(repository);
      const authored = repository.getDataset().stories;

      expect(result.data).toHaveLength(authored.length);
      expect(result.citations).toHaveLength(authored.length);
      for (const entry of result.data) {
        expect(entry.primaryExperience.id).toBe(entry.story.experienceId);
      }
    });

    it("ranks the Xogito client-recovery story ahead of the Mutual story for the leadership filter", () => {
      const leadership = ids(listCareerStories(repository, { competencies: ["leadership"] }));

      expect(leadership).toContain("xogito-client-account-recovery");
      expect(leadership).toContain("mutual-informal-leadership");
      expect(leadership.indexOf("xogito-client-account-recovery")).toBeLessThan(
        leadership.indexOf("mutual-informal-leadership"),
      );
    });

    it("keeps the Xogito story ahead of the Mutual story under the combined leadership-and-influence filter too", () => {
      const leadership = ids(
        listCareerStories(repository, { competencies: ["leadership", "influence"] }),
      );

      expect(leadership.indexOf("xogito-client-account-recovery")).toBeLessThan(
        leadership.indexOf("mutual-informal-leadership"),
      );
    });

    it("labels the related House Numbers role on the onboarding-framework story without moving its Xogito parent", () => {
      const [entry] = listCareerStories(repository, { id: "cross-team-onboarding-framework" }).data;

      expect(entry?.primaryExperience.company).toBe("Xogito Group");
      expect(entry?.relatedExperiences.map((related) => related.company)).toEqual([
        "House Numbers",
      ]);
      expect(
        ids(
          listCareerStories(repository, {
            company: "house numbers",
            experienceId: "xogito-group-2020-senior-software-development-engineer",
          }),
        ),
      ).toEqual([]);
    });
  });
});
