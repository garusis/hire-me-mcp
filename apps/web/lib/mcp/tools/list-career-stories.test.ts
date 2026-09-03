import type { CareerDataRepository, DomainResult } from "@hire-me-mcp/core";
import * as core from "@hire-me-mcp/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { COMPETENCIES } from "../../../src/lib/content/entity-schemas.js";
import { getWritingListView, listStoryParents } from "../../../src/lib/content/index.js";
import { getCareerDataRepository } from "../../../src/lib/content/repository.js";
import { recordMcpToolEvent } from "../../analytics/record.js";
import { withCitationSiteUrls } from "../citation-site-urls.js";
import { createToolExecutor } from "../define-tool.js";
import { listCareerStoriesTool } from "./list-career-stories.js";

vi.mock("@hire-me-mcp/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@hire-me-mcp/core")>();
  return { ...actual, listCareerStories: vi.fn() };
});
vi.mock("../../../src/lib/content/repository", () => ({
  getCareerDataRepository: vi.fn(
    () => ({ getDataset: vi.fn() }) as unknown as CareerDataRepository,
  ),
}));
// The citation-URL enrichment (`citation-site-urls.ts`) reads the story ->
// primary-experience lookup through the content barrel; pin it to the
// fixture stories below so the parent-anchor mapping is observable here.
vi.mock("../../../src/lib/content/index.js", () => ({
  getWritingListView: vi.fn(() => ({ items: [] })),
  listStoryParents: vi.fn(() => [
    { storyId: "fixture-story", experienceId: "primary-role" },
    { storyId: "second-story", experienceId: "second-role" },
  ]),
}));
vi.mock("../../analytics/record.js", () => ({ recordMcpToolEvent: vi.fn() }));

/** Derived from `core.listCareerStories`'s return type — see `list-career-stories.ts` for why. */
type CareerStoryListEntry = ReturnType<typeof core.listCareerStories>["data"][number];

const primaryContext: CareerStoryListEntry["primaryExperience"] = {
  id: "primary-role",
  company: "Primary Co",
  role: "Senior Engineer",
  startDate: "2020-01",
  endDate: "2021-06",
};

const relatedContext: CareerStoryListEntry["relatedExperiences"][number] = {
  id: "related-role",
  company: "Related Co",
  role: "Contract Engineer",
  startDate: "2019-01",
};

function entry(
  overrides: Partial<CareerStoryListEntry> & { id?: string } = {},
): CareerStoryListEntry {
  const id = overrides.id ?? "fixture-story";
  return {
    story: {
      id,
      experienceId: "primary-role",
      relatedExperienceIds: ["related-role"],
      title: "Fixture story title",
      primaryCompetency: "leadership",
      supportingCompetencies: ["stakeholder-management", "communication"],
      situation: "Fixture situation.",
      task: "Fixture task.",
      actions: ["Fixture action one.", "Fixture action two."],
      results: ["Fixture result."],
      reflection: "Fixture reflection.",
      retrievalTags: ["client-recovery", "quick-wins"],
    },
    primaryExperience: primaryContext,
    relatedExperiences: [relatedContext],
    citation: { entityType: "story", entityId: id, label: "Fixture story title" },
    ...overrides,
  };
}

function domainResult(entries: CareerStoryListEntry[]): DomainResult<CareerStoryListEntry[]> {
  return { data: entries, citations: entries.map((item) => item.citation) };
}

describe("listCareerStoriesTool (#293)", () => {
  beforeEach(() => {
    vi.mocked(core.listCareerStories).mockReset();
    vi.mocked(recordMcpToolEvent).mockClear();
  });

  it("has the conventional kebab-case name, a human-readable title, and a non-empty description", () => {
    expect(listCareerStoriesTool.name).toBe("list-career-stories");
    expect(listCareerStoriesTool.title).toBeTruthy();
    expect(listCareerStoriesTool.title).not.toContain("-");
    expect(listCareerStoriesTool.description.length).toBeGreaterThan(0);
  });

  it("declares an outputSchema documenting the { data, citations } envelope around complete stories with primary and related context (#242)", () => {
    expect(listCareerStoriesTool.outputSchema).toBeDefined();
    const jsonSchema = z.toJSONSchema(listCareerStoriesTool.outputSchema as z.ZodTypeAny) as {
      properties?: Record<string, unknown>;
    };
    expect(Object.keys(jsonSchema.properties ?? {})).toEqual(
      expect.arrayContaining(["data", "citations"]),
    );
    const parsed = (listCareerStoriesTool.outputSchema as z.ZodTypeAny).safeParse({
      data: [entry()],
      citations: withCitationSiteUrls([entry().citation]),
    });
    expect(parsed.success, parsed.success ? undefined : JSON.stringify(parsed.error.issues)).toBe(
      true,
    );
    const itemSchema = (
      z.toJSONSchema(listCareerStoriesTool.outputSchema as z.ZodTypeAny) as unknown as {
        properties: { data: { items: { properties: Record<string, unknown> } } };
      }
    ).properties.data.items;
    expect(Object.keys(itemSchema.properties).sort()).toEqual([
      "citation",
      "primaryExperience",
      "relatedExperiences",
      "story",
    ]);
  });

  it("advertises every controlled competency value as an enum in the live input schema", () => {
    const jsonSchema = z.toJSONSchema(listCareerStoriesTool.inputSchema) as unknown as {
      properties: { competencies: { items: { enum: string[] } } };
    };
    expect(jsonSchema.properties.competencies.items.enum).toEqual([...COMPETENCIES]);
    expect(jsonSchema.properties.competencies.items.enum).toContain("leadership");
    expect(jsonSchema.properties.competencies.items.enum).toContain("stakeholder-management");
  });

  it("with no arguments, calls the domain service with an empty filter and returns every story unchanged", async () => {
    const result = domainResult([entry(), entry({ id: "second-story" })]);
    vi.mocked(core.listCareerStories).mockReturnValue(result);
    const executor = createToolExecutor(listCareerStoriesTool);

    const outcome = await executor({});

    expect(core.listCareerStories).toHaveBeenCalledWith(expect.anything(), {});
    expect(outcome.isError).toBeUndefined();
    expect(outcome.structuredContent).toEqual({
      data: result.data,
      citations: withCitationSiteUrls(result.citations),
    });
  });

  it.each([
    ["id", { id: "fixture-story" }],
    ["experienceId", { experienceId: "related-role" }],
    ["company", { company: "Primary Co" }],
    ["competencies", { competencies: ["leadership", "ownership"] }],
  ])("passes the %s filter through to the domain service unchanged", async (_label, filter) => {
    vi.mocked(core.listCareerStories).mockReturnValue(domainResult([entry()]));
    const executor = createToolExecutor(listCareerStoriesTool);

    const outcome = await executor(filter);

    expect(core.listCareerStories).toHaveBeenCalledWith(expect.anything(), filter);
    expect(outcome.isError).toBeUndefined();
  });

  it("passes a combination of every filter through unchanged — AND semantics and same-association matching are the domain service's job", async () => {
    vi.mocked(core.listCareerStories).mockReturnValue(domainResult([]));
    const executor = createToolExecutor(listCareerStoriesTool);
    const filter = {
      id: "Fixture-Story",
      experienceId: "Related-Role",
      company: "primary co",
      competencies: ["leadership"],
    };

    await executor(filter);

    expect(core.listCareerStories).toHaveBeenCalledWith(expect.anything(), filter);
  });

  it("passes an empty competencies array through unchanged rather than dropping or rejecting it", async () => {
    vi.mocked(core.listCareerStories).mockReturnValue(domainResult([entry()]));
    const executor = createToolExecutor(listCareerStoriesTool);

    const outcome = await executor({ competencies: [] });

    expect(core.listCareerStories).toHaveBeenCalledWith(expect.anything(), { competencies: [] });
    expect(outcome.isError).toBeUndefined();
  });

  it("puts the complete story plus compact primary and distinctly labeled related role context on the wire, unmodified", async () => {
    const item = entry();
    vi.mocked(core.listCareerStories).mockReturnValue(domainResult([item]));
    const executor = createToolExecutor(listCareerStoriesTool);

    const outcome = await executor({});

    const structured = outcome.structuredContent as { data: CareerStoryListEntry[] };
    expect(structured.data).toHaveLength(1);
    const wire = structured.data[0] as CareerStoryListEntry;
    expect(wire.story).toEqual(item.story);
    expect(wire.story.actions).toEqual(["Fixture action one.", "Fixture action two."]);
    expect(wire.story.retrievalTags).toEqual(["client-recovery", "quick-wins"]);
    expect(wire.primaryExperience).toEqual(primaryContext);
    expect(wire.relatedExperiences).toEqual([relatedContext]);
    expect(Object.keys(wire).sort()).toEqual([
      "citation",
      "primaryExperience",
      "relatedExperiences",
      "story",
    ]);
  });

  it("filtering through a related experience keeps the primary role as the event parent and the citation on the story, resolved to the PRIMARY experience anchor", async () => {
    const item = entry();
    vi.mocked(core.listCareerStories).mockReturnValue(domainResult([item]));
    const executor = createToolExecutor(listCareerStoriesTool);

    const outcome = await executor({ experienceId: "related-role" });

    const structured = outcome.structuredContent as {
      data: CareerStoryListEntry[];
      citations: Array<{ entityType: string; entityId: string; url: string }>;
    };
    expect(structured.data[0]?.primaryExperience.id).toBe("primary-role");
    expect(structured.data[0]?.relatedExperiences.map((r) => r.id)).toEqual(["related-role"]);
    expect(structured.citations).toHaveLength(1);
    expect(structured.citations[0]).toMatchObject({
      entityType: "story",
      entityId: "fixture-story",
    });
    expect(structured.citations[0]?.url).toMatch(/\/experience#primary-role$/);
    expect(structured.citations[0]?.url).not.toContain("related-role");
  });

  it("resolves every story citation to /experience#<primary-experience-id> without downgrading entityType to 'experience'", async () => {
    vi.mocked(core.listCareerStories).mockReturnValue(
      domainResult([
        entry(),
        entry({
          id: "second-story",
          primaryExperience: { ...primaryContext, id: "second-role" },
          relatedExperiences: [],
        }),
      ]),
    );
    const executor = createToolExecutor(listCareerStoriesTool);

    const outcome = await executor({});

    const structured = outcome.structuredContent as {
      citations: Array<{ entityType: string; entityId: string; url: string }>;
    };
    expect(structured.citations.map((c) => [c.entityType, c.entityId, c.url])).toEqual([
      ["story", "fixture-story", expect.stringMatching(/\/experience#primary-role$/)],
      ["story", "second-story", expect.stringMatching(/\/experience#second-role$/)],
    ]);
    for (const citation of structured.citations) {
      expect(citation.url).not.toContain("/stories");
    }
  });

  it("returns a SUCCESSFUL empty list when nothing matches, not an error", async () => {
    vi.mocked(core.listCareerStories).mockReturnValue(domainResult([]));
    const executor = createToolExecutor(listCareerStoriesTool);

    const outcome = await executor({ company: "Nowhere Inc" });

    expect(outcome.isError).toBeUndefined();
    expect(outcome.structuredContent).toEqual({ data: [], citations: [] });
  });

  it("rejects an unknown competency with invalid_input, naming every allowed value and the received value (#244)", async () => {
    const executor = createToolExecutor(listCareerStoriesTool);

    const outcome = await executor({ competencies: ["leadership", "grit"] });

    expect(outcome.isError).toBe(true);
    expect(outcome.structuredContent).toMatchObject({ code: "invalid_input" });
    const message = (outcome.structuredContent as { message: string }).message;
    expect(message).toContain("competencies.1:");
    expect(message).toContain('"grit"');
    for (const competency of COMPETENCIES) {
      expect(message).toContain(`"${competency}"`);
    }
    expect(core.listCareerStories).not.toHaveBeenCalled();
  });

  it("rejects an unknown field with invalid_input that names the field and the supported ones — no silent stripping", async () => {
    const executor = createToolExecutor(listCareerStoriesTool);

    const outcome = await executor({ competency: "leadership" });

    expect(outcome.isError).toBe(true);
    expect(outcome.structuredContent).toMatchObject({ code: "invalid_input" });
    const message = (outcome.structuredContent as { message: string }).message;
    expect(message).toContain('"competency"');
    expect(message).toContain("competencies");
    expect(core.listCareerStories).not.toHaveBeenCalled();
  });

  it.each([
    ["a wrong-typed id", { id: 42 }],
    ["an empty company", { company: "" }],
    ["an over-long experienceId", { experienceId: "x".repeat(201) }],
    ["a non-array competencies", { competencies: "leadership" }],
  ])("rejects %s with a sanitized, field-named invalid_input error", async (_label, input) => {
    const executor = createToolExecutor(listCareerStoriesTool);

    const outcome = await executor(input);

    expect(outcome.isError).toBe(true);
    expect(outcome.structuredContent).toMatchObject({ code: "invalid_input" });
    const message = (outcome.structuredContent as { message: string }).message;
    expect(message).toMatch(/^(id|company|experienceId|competencies):/);
    expect(message).not.toMatch(/^\S+: Invalid input$/);
  });

  it("records exactly one analytics event under its own tool name for a successful call (#79)", async () => {
    vi.mocked(core.listCareerStories).mockReturnValue(domainResult([entry()]));
    const executor = createToolExecutor(listCareerStoriesTool);

    await executor({ competencies: ["leadership"] });

    expect(recordMcpToolEvent).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordMcpToolEvent).mock.calls[0]?.[0]).toBe("list-career-stories");
    expect(vi.mocked(recordMcpToolEvent).mock.calls[0]?.[1]).toBe("success");
  });

  it("records exactly one invalid_input analytics event for a rejected call (#79)", async () => {
    const executor = createToolExecutor(listCareerStoriesTool);

    await executor({ competencies: ["nope"] });

    expect(recordMcpToolEvent).toHaveBeenCalledTimes(1);
    expect(vi.mocked(recordMcpToolEvent).mock.calls[0]?.[0]).toBe("list-career-stories");
    expect(vi.mocked(recordMcpToolEvent).mock.calls[0]?.[1]).toBe("invalid_input");
  });

  describe("over the real dataset (#296)", () => {
    it("returns every real story with an exact entityId/label citation anchored to its real primary-experience parent, never a bare /experience fallback", async () => {
      const actualCore =
        await vi.importActual<typeof import("@hire-me-mcp/core")>("@hire-me-mcp/core");
      const actualRepository = await vi.importActual<
        typeof import("../../../src/lib/content/repository.js")
      >("../../../src/lib/content/repository.js");
      const actualContent = await vi.importActual<
        typeof import("../../../src/lib/content/index.js")
      >("../../../src/lib/content/index.js");

      const repository = actualRepository.getCareerDataRepository();
      vi.mocked(getCareerDataRepository).mockReturnValue(repository);
      vi.mocked(core.listCareerStories).mockImplementation((repo, filter) =>
        actualCore.listCareerStories(repo, filter),
      );
      vi.mocked(listStoryParents).mockReturnValue(actualContent.listStoryParents(repository));
      vi.mocked(getWritingListView).mockReturnValue({
        items: [],
      } as unknown as ReturnType<typeof getWritingListView>);

      const executor = createToolExecutor(listCareerStoriesTool);

      const outcome = await executor({});

      const structured = outcome.structuredContent as {
        data: CareerStoryListEntry[];
        citations: Array<{ entityType: string; entityId: string; label: string; url: string }>;
      };
      expect(structured.data.length).toBeGreaterThan(0);
      expect(structured.citations.length).toBe(structured.data.length);
      for (const [index, item] of structured.data.entries()) {
        const citation = structured.citations[index];
        if (citation === undefined) {
          throw new Error("missing citation for story");
        }
        expect(citation.entityType).toBe("story");
        expect(citation.entityId).toBe(item.story.id);
        expect(citation.label).toBe(item.story.title);
        expect(citation.url, `story "${item.story.id}" fell back to bare /experience`).toBe(
          `http://localhost:3000/experience#${item.primaryExperience.id}`,
        );
        expect(citation.url).not.toBe("http://localhost:3000/experience");
      }
    });
  });

  describe("routing description (#293, #305 decision 5)", () => {
    const description = listCareerStoriesTool.description;

    it("names the behavioral prompts this tool is for", () => {
      for (const theme of [
        "leadership",
        "ownership",
        "conflict",
        "ambiguity",
        "stakeholder management",
        "failure",
        "decision making",
      ]) {
        expect(description.toLowerCase()).toContain(theme);
      }
      expect(description.toLowerCase()).toMatch(/tell me about a time/);
    });

    it("routes chronological company/role/date/technology history to get-experience", () => {
      expect(description).toMatch(/get-experience/);
      expect(description.toLowerCase()).toMatch(/chronolog/);
    });

    it("routes fuzzy behavioral phrasing to search-career scoped to story sources FIRST, with broader search only after an empty story search, explicitly labeled", () => {
      expect(description).toContain("search-career");
      expect(description).toMatch(/sourceTypes:? ?\[["']story["']\]/);
      expect(description.toLowerCase()).toMatch(/first/);
      expect(description.toLowerCase()).toMatch(/empty/);
      expect(description.toLowerCase()).toMatch(/closest evidence/);
      expect(description.toLowerCase()).toMatch(/label/);
    });

    it("tells the model there is no search-stories tool to call", () => {
      expect(description).toMatch(/search-stories[^.]*(no such tool|does not exist|none exists)/i);
    });

    it("states the content is public only because the caller explicitly requested it through this public MCP", () => {
      expect(description.toLowerCase()).toMatch(/public/);
      expect(description.toLowerCase()).toMatch(/explicitly/);
    });

    it("states that an empty match is a successful empty list, not an error", () => {
      expect(description.toLowerCase()).toMatch(/empty list/);
      expect(description.toLowerCase()).toMatch(/not an error/);
    });

    it("advertises only filter fields that exist on the live input schema — no nonexistent 'role' field (independent review, #293)", () => {
      const jsonSchema = z.toJSONSchema(listCareerStoriesTool.inputSchema) as unknown as {
        properties: Record<string, unknown>;
      };
      const liveFilterFields = Object.keys(jsonSchema.properties);
      expect(liveFilterFields).toEqual(["id", "experienceId", "company", "competencies"]);
      expect(liveFilterFields).not.toContain("role");

      // The "use this whenever ..." guidance names concrete fields a caller can
      // supply; it must never claim a bare "role" filter exists (there is no
      // such input field — only exact `experienceId` or `company`).
      expect(description).not.toMatch(/whenever the competency, company, or role is known/i);
      expect(description.toLowerCase()).toMatch(
        /whenever the competency, company, or experience id is known/,
      );
    });
  });
});
