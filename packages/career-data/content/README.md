# Content directory

This directory holds Marcos's real career content, validated at build time by
`pnpm --filter @hire-me-mcp/career-data validate` against the schemas in
`src/schemas/`. It was intentionally empty as of #47 (scaffolding only) —
`validate` treats missing files as "not authored yet", not an error, so an
empty tree exits 0.

Content is authored in follow-up issues:

- #48 (done) — `profile.json`, `experience/*.json`, `education.json`,
  `writing/*.mdx`. `writing/` is currently an intentionally empty-but-valid
  collection — no published writing/talks with a public URL exist in the
  sourced career references yet.
- #50 (done) — `skills.json`, `projects/*.mdx`, `gaps.json`. Every `Skill`
  cites at least one real `experience`/`project` id; every deliberately
  non-claimed technology from the gap-discipline reference is a `Gap`
  record with an honest statement and `relatedSkills`. Invariant tests live
  in `src/content/real-content.test.ts`.

Layout (see `src/content/loader.ts` for the authoritative mapping):

```
content/
  profile.json         # Profile (singleton JSON object)
  experience/*.json    # one ExperienceEntry per file
  projects/*.mdx        # one Project per file (frontmatter + long-form body)
  skills.json           # Skill[] (JSON array)
  gaps.json             # Gap[] (JSON array)
  education.json        # EducationEntry[] (JSON array)
  writing/*.mdx          # one WritingEntry per file (frontmatter + long-form body)
  recommendations/*.json # one Recommendation per file (LinkedIn, verbatim)
  stories/*.json         # one CareerStory per file (#289); the owner-approved corpus authored in #290
  story-preservation-map.json # #290 review fixture: every experience summary/highlight classified and mapped to its canonical story
```

`stories/` holds behavioral stories: one concrete event each, linked to
exactly one primary `experience` id (plus optional distinct
`relatedExperienceIds`), with one primary competency and up to five
supporting ones from the controlled vocabulary in
`src/schemas/competency.ts`, and one to fifteen lower-kebab-case
`retrievalTags` that never spell a competency. `retrievalQuestions` is
deliberately not a story field — eval questions live in the #295 manifest,
never in indexed story text. Coverage is evidence-driven: an experience may
have zero stories. `stories/README.md` is the per-story result-claim review
checklist.

`story-preservation-map.json` classifies every experience `summary` and
`highlights.N` as `role-context`, `concise-outcome`, or `detailed-story`,
records the `storyIds` that hold the canonical narrative, and the `action`
#297 may take (`keep`, `shorten`, `move-detail-to-story`,
`correct-inconsistency`). The `story-preservation-map-resolves` lint rule
blocks the build when a mapped field or story does not exist, when a
mapped story is not associated with that experience, or when a
`detailed-story` / `move-detail-to-story` entry names no story. The
`story-preservation-map-complete` rule blocks it when any experience
`summary` or `highlights.N` has no row in the map at all — so a removed or
never-written mapping is a `pnpm lint:content` error, and detailed prose
can never be shortened before its evidence is preserved. Neither rule
requires an experience to have a story; only the classification must be
complete.

#297 performed the deduplication the map authorizes: the three `detailed-story`
fields were shortened to concise, résumé-level highlights (and the Xogito one
corrected against its approved story), the Kubesoft and Rokk3r entries were
rewritten so the assignment relationship is explicit, and every row records
the action taken in its `note`. The `no-story-detail-in-experience` lint rule
now blocks any story sentence (situation, task, action, result, reflection;
eight words or more; compared case-, punctuation- and whitespace-insensitively)
from reappearing verbatim in its primary or related experience's `summary` or
`highlights` — a highlight may name an event, never retell it. Semantic
near-duplication still needs human review; the rule is an exact-string guard.
