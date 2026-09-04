import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { idSchema } from "../schemas/index.js";
import { loadContentDir, validateContentDir } from "./loader.js";

/**
 * Invariant tests over the real, authored `content/experience/*.json`
 * entries (#48) — one per role in the canonical career reference.
 */
const contentDir = fileURLToPath(new URL("../../content/", import.meta.url));
const experienceDir = path.join(contentDir, "experience");

interface ExperienceRecord {
  id: string;
  company: string;
  role: string;
  startDate: string;
  endDate?: string;
  tech: string[];
}

function readExperienceEntries(): ExperienceRecord[] {
  return fs
    .readdirSync(experienceDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => JSON.parse(fs.readFileSync(path.join(experienceDir, file), "utf-8")));
}

describe("real content: experience/*.json", () => {
  it("validates every experience file against the ExperienceEntry schema", () => {
    const errors = validateContentDir(contentDir).filter((error) =>
      error.file.startsWith("experience/"),
    );
    expect(errors).toEqual([]);
  });

  it("has all seven roles from the canonical career reference, none silently dropped", () => {
    const expectedRoles = [
      { company: "House Numbers", startDate: "2022-05" },
      { company: "Xogito Group", startDate: "2020-12" },
      { company: "FullStack Labs", startDate: "2018-12" },
      { company: "Belatrix Software", startDate: "2018-07" },
      { company: "Rokk3r", startDate: "2016-02" },
      { company: "Kubesoft SAS", startDate: "2015-01" },
      { company: "Jarvi Games", startDate: "2013-02" },
    ];
    const actual = readExperienceEntries().map(({ company, startDate }) => ({
      company,
      startDate,
    }));
    expect(actual).toHaveLength(expectedRoles.length);
    for (const role of expectedRoles) {
      expect(actual).toContainEqual(role);
    }
  });

  it("has exactly one current (open-ended) role, using an omitted endDate", () => {
    const current = readExperienceEntries().filter((entry) => entry.endDate === undefined);
    expect(current).toHaveLength(1);
    expect(current[0]?.company).toBe("House Numbers");
  });

  it("every entry has a startDate matching the documented YYYY-MM format", () => {
    const entries = readExperienceEntries();
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.startDate).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    }
  });

  it("is chronologically consistent: endDate absent or >= startDate, for every entry", () => {
    for (const entry of readExperienceEntries()) {
      if (entry.endDate !== undefined) {
        expect(entry.endDate >= entry.startDate).toBe(true);
      }
    }
  });

  it("has ids matching the documented slug pattern, unique across all entries", () => {
    const ids = readExperienceEntries().map((entry) => entry.id);
    for (const id of ids) {
      expect(idSchema.safeParse(id).success).toBe(true);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Tech-tag vocabulary membership is a cross-entity invariant — enforced
  // once, by name, as `tag-in-vocabulary` in the #51 rule engine, and
  // asserted against this real content set in
  // src/content/real-content-lint.test.ts, rather than duplicated here.
});

/**
 * #297 deduplication invariants: summaries describe roles, highlights state
 * concise outcomes, and the story corpus (#290) holds the full narratives.
 * These lock the specific fields the preservation map selected for cleanup
 * and the owner-confirmed Kubesoft / Rokk3r correction, without overfitting
 * full prose. The mechanical "no story sentence copied verbatim" guard is
 * the `no-story-detail-in-experience` lint rule, asserted over real content
 * in `real-content-lint.test.ts`.
 */
describe("real content: experience summaries and highlights after #297", () => {
  const dataset = loadContentDir(contentDir);
  const experience = (id: string) => {
    const entry = dataset.experience.find((candidate) => candidate.id === id);
    if (entry === undefined) throw new Error(`experience ${id} missing`);
    return entry;
  };
  const highlight = (id: string, index: number) => {
    const text = experience(id).highlights[index];
    if (text === undefined) throw new Error(`${id} highlights.${index} missing`);
    return text;
  };

  /** A résumé-level highlight: one or two sentences, never a step-by-step retelling. */
  const CONCISE_HIGHLIGHT_MAX_CHARS = 300;

  describe("xogito highlights.1 — client-account recovery (story xogito-client-account-recovery)", () => {
    const text = () => highlight("xogito-group-2020-senior-software-development-engineer", 1);

    it("names the event concisely: the project manager left and the client account was recovered", () => {
      expect(text()).toMatch(/project manager|\bPM\b/);
      expect(text()).toMatch(/client/i);
      expect(text()).toMatch(/recover/i);
      expect(text().length).toBeLessThanOrEqual(CONCISE_HIGHLIGHT_MAX_CHARS);
    });

    it("no longer claims the recovery won or caused further work (#305 point 9) nor the unsupported roadmap/renegotiation wording", () => {
      expect(text()).not.toMatch(/\bwon\b/i);
      expect(text()).not.toMatch(/further work/i);
      expect(text()).not.toMatch(/\bcaused\b/i);
      expect(text()).not.toMatch(/reorganized roadmap/i);
      expect(text()).not.toMatch(/renegotiat/i);
    });

    it("keeps the facts the approved story states: no formal authority is claimed, and the client's later projects are not mentioned", () => {
      expect(text()).not.toMatch(/product manager|product-management authority/i);
      expect(text()).not.toMatch(/commissioned|additional projects/i);
    });
  });

  describe("house-numbers highlights.1 — communication infrastructure (story house-numbers-communication-service-ownership)", () => {
    const text = () => highlight("house-numbers-2022-senior-full-stack-engineer", 1);

    it("still states the capability every citing skill relies on: classification and routing over encrypted loan data", () => {
      expect(text()).toMatch(/classif/i);
      expect(text()).toMatch(/encrypt/i);
      expect(text()).toMatch(/deterministic/i);
      expect(text().length).toBeLessThanOrEqual(CONCISE_HIGHLIGHT_MAX_CHARS);
    });

    it("leaves the bounded production figure and the observability build-out to the story", () => {
      expect(text()).not.toMatch(/57,?000|70%/);
      expect(text()).not.toMatch(/reconciliation/i);
    });
  });

  describe("fullstack-labs highlights.1 — legacy quote-data migration (story fullstack-labs-sap-migration)", () => {
    const text = () => highlight("fullstack-labs-2018-senior-software-engineer", 1);

    it("still states the outcome: legacy data migrated with financial continuity for the client", () => {
      expect(text()).toMatch(/legacy/i);
      expect(text()).toMatch(/migrat/i);
      expect(text()).toMatch(/financial|totals/i);
      expect(text().length).toBeLessThanOrEqual(CONCISE_HIGHLIGHT_MAX_CHARS);
    });

    it("leaves the rounding root cause and the cutover mechanics to the story", () => {
      expect(text()).not.toMatch(/rounding behavior between JavaScript/);
      expect(text()).not.toMatch(/snapshot|frozen/i);
    });
  });

  describe("house-numbers highlights.0 — document-extraction PoC (#300; project record is canonical)", () => {
    const text = () => highlight("house-numbers-2022-senior-full-stack-engineer", 0);

    it("is one short highlight that keeps the PoC-stayed-experimental boundary", () => {
      expect(text()).toMatch(/proof of concept/i);
      expect(text()).toMatch(/production kept the vendor/i);
      expect(text()).toMatch(/vision/i);
      expect(text().length).toBeLessThan(450);
    });
  });

  describe("kubesoft / rokk3r — one employment, not two concurrent jobs (owner correction on #297)", () => {
    const kubesoft = () => experience("kubesoft-2015-senior-full-stack-and-mobile-developer");
    const rokk3r = () => experience("rokk3r-2016-senior-full-stack-developer-and-devops");

    it("preserves the canonical dates and titles of both entries", () => {
      expect(kubesoft().role).toBe("Senior Full Stack & Mobile Developer");
      expect(kubesoft().startDate).toBe("2015-01");
      expect(kubesoft().endDate).toBe("2018-06");
      expect(rokk3r().role).toBe("Senior Full Stack Developer and DevOps");
      expect(rokk3r().startDate).toBe("2016-02");
      expect(rokk3r().endDate).toBe("2018-06");
    });

    it("never describes the two roles as concurrent responsibilities", () => {
      const kubesoftText = [kubesoft().summary, ...kubesoft().highlights].join(" ");
      const rokk3rText = [rokk3r().summary, ...rokk3r().highlights].join(" ");
      expect(kubesoftText).not.toMatch(/concurrent/i);
      expect(rokk3rText).not.toMatch(/concurrent/i);
    });

    it("states the assignment relationship in both directions: Kubesoft assigned him to Rokk3r", () => {
      expect(kubesoft().summary).toMatch(/assigned/i);
      expect(kubesoft().summary).toMatch(/Rokk3r/);
      expect(rokk3r().summary).toMatch(/Kubesoft/);
      expect(rokk3r().summary).toMatch(/assigned|employer/i);
    });

    it("gives the Kubesoft role a concise Mutual highlight without copying either Mutual story", () => {
      const mutual = kubesoft().highlights[1];
      expect(mutual).toBeDefined();
      expect(mutual).toMatch(/Mutual/);
      expect(mutual).toMatch(/backend/i);
      expect(mutual).not.toMatch(/prize|renounced|disagreement/i);
      expect(mutual?.length ?? 0).toBeLessThanOrEqual(CONCISE_HIGHLIGHT_MAX_CHARS);
    });
  });

  describe("skill evidence fragments still resolve and still support the claimed skill", () => {
    /**
     * For every skill citation anchored to an experience fragment, the
     * cited text must still contain the term that makes it evidence for
     * that skill. A new fragment citation must add its support pattern
     * here, so a future rewrite cannot silently hollow out a citation.
     */
    const SUPPORT_PATTERNS: Record<string, RegExp> = {
      kubernetes: /Kubernetes/,
      serverless: /CloudFormation|serverless/i,
      microservices: /service/i,
      "event-driven-architecture": /asynchronous|event|webhook/i,
      observability: /observab/i,
      llms: /LLM/,
      "ai-agents": /agentic|agent/i,
      "prompt-engineering": /prompt/i,
      mentoring: /onboard|mentor/i,
      "requirements-gathering": /requirements/i,
      "regulated-data-handling": /encrypt/i,
      "vision-document-processing": /vision/i,
      webhooks: /webhook/i,
      etl: /ETL/i,
    };

    /** Every `(skill, experience fragment)` pair skills.json cites, with the cited text resolved. */
    function fragmentCitations(): Array<{
      skillId: string;
      locator: string;
      text: string | undefined;
    }> {
      return dataset.skills.flatMap((skill) =>
        skill.evidence
          .filter(
            (citation) => citation.entityType === "experience" && citation.fragment !== undefined,
          )
          .map((citation) => {
            const fragment = citation.fragment as string;
            const entry = experience(citation.entityId);
            const text =
              fragment === "summary"
                ? entry.summary
                : entry.highlights[Number(fragment.slice("highlights.".length))];
            return {
              skillId: skill.id,
              locator: `${skill.id} -> ${citation.entityId}#${fragment}`,
              text,
            };
          }),
      );
    }

    it("every experience-fragment citation resolves to text matching its skill's support pattern", () => {
      const citations = fragmentCitations();
      expect(citations.length).toBeGreaterThanOrEqual(12);
      for (const { skillId, locator, text } of citations) {
        const pattern = SUPPORT_PATTERNS[skillId];
        expect(
          pattern,
          `skill "${skillId}" cites an experience fragment but has no support pattern`,
        ).toBeDefined();
        expect(text, locator).toBeDefined();
        expect(text, locator).toMatch(pattern as RegExp);
      }
    });
  });
});
