# Content directory

This directory holds Marcos's real career content, validated at build time by
`pnpm --filter @hire-me-mcp/career-data validate` against the schemas in
`src/schemas/`. It is intentionally empty as of #47 (scaffolding only) —
`validate` treats missing files as "not authored yet", not an error, so an
empty tree exits 0.

Content is authored in follow-up issues:

- #48 — `profile.json`, `experience/*.json`, `education.json`, `writing/*.mdx`
- #50 — `skills.json`, `projects/*.mdx`, `gaps.json`

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
```
