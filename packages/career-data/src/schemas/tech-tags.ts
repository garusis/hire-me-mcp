/**
 * Controlled vocabulary of canonical technology tag spellings.
 *
 * Experience entries (and, later, skills and projects — see #50 and #55)
 * must only use tags from this list, so a technology is never split across
 * multiple spellings (one `postgresql`, never `postgres`/`Postgres`). Tags
 * are lowercase kebab-case, matching `idSchema`'s convention.
 *
 * Grow this list as new, real technologies are authored into content —
 * don't pre-populate it with tags nothing uses yet, except where a source
 * document (CV, canonical career reference) already names them.
 */
export const TECH_TAGS = [
  "typescript",
  "javascript",
  "nodejs",
  "react",
  "nestjs",
  "mongodb",
  "postgresql",
  "redis",
  "aws",
  "docker",
  "kubernetes",
  "angularjs",
  "socketio",
  "php",
  "serverless",
  "openai-api",
  "anthropic-api",
  "gitlab-ci",
  "python",
  "microservices",
  "event-driven-architecture",
  "rest-apis",
  "ci-cd",
  "observability",
  "llms",
  "llm-evaluation",
  "ai-agents",
  "prompt-engineering",
  "sql",
  "turborepo",
  "pnpm",
  "nextjs",
  "vercel",
  "playwright",
  "mcp",
  "rag",
  "github-actions",
  "vision-document-processing",
  "pgvector",
  "vitest",
  "zod",
  "gemini",
  "new-relic",
  "ecs",
  "dynamodb",
  "webhooks",
  "etl",
] as const;

/** A single canonical technology tag spelling from {@link TECH_TAGS}. */
export type TechTag = (typeof TECH_TAGS)[number];

/** Type guard: is `tag` a member of the controlled vocabulary? */
export function isKnownTechTag(tag: string): tag is TechTag {
  return (TECH_TAGS as readonly string[]).includes(tag);
}
