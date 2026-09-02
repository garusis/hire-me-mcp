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
  stories/*.json         # one CareerStory per file (#289) — empty-but-valid until #290 authors the corpus
```

`stories/` holds behavioral stories: one concrete event each, linked to
exactly one primary `experience` id (plus optional distinct
`relatedExperienceIds`), with one primary competency and up to five
supporting ones from the controlled vocabulary in
`src/schemas/competency.ts`, and one to fifteen lower-kebab-case
`retrievalTags` that never spell a competency. `retrievalQuestions` is
deliberately not a story field — eval questions live in the #295 manifest,
never in indexed story text. Coverage is evidence-driven: an experience may
have zero stories.
