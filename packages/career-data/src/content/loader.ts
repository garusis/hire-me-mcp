import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { z } from "zod";
import type { CitableEntityType } from "../schemas/common.js";
import type { EducationEntry } from "../schemas/education.js";
import { educationEntrySchema } from "../schemas/education.js";
import type { ExperienceEntry } from "../schemas/experience.js";
import { experienceEntrySchema } from "../schemas/experience.js";
import type { Gap } from "../schemas/gap.js";
import { gapSchema } from "../schemas/gap.js";
import type { Profile } from "../schemas/profile.js";
import { profileSchema } from "../schemas/profile.js";
import type { Project } from "../schemas/project.js";
import { projectSchema } from "../schemas/project.js";
import type { Skill } from "../schemas/skill.js";
import { skillSchema } from "../schemas/skill.js";
import type { WritingEntry } from "../schemas/writing.js";
import { writingEntrySchema } from "../schemas/writing.js";

/** One reported failure: which file, which field, and why. */
export interface ContentValidationError {
  /** Path to the offending file, relative to the content directory. */
  file: string;
  /** Dot/bracket field path within that file, or "(root)" for the whole document. */
  path: string;
  message: string;
}

type ContentLayoutEntry =
  | { entityType: string; kind: "single-json"; relPath: string; schema: z.ZodType }
  | { entityType: string; kind: "array-json"; relPath: string; schema: z.ZodType }
  | { entityType: string; kind: "per-file-json"; dir: string; schema: z.ZodType }
  | { entityType: string; kind: "per-file-mdx"; dir: string; schema: z.ZodType };

/**
 * The content directory layout: which file(s) back each entity type, and
 * which schema validates them. `content/profile.json` is a JSON singleton,
 * `content/experience/*.json` is one ExperienceEntry per file,
 * `content/projects/*.mdx` and `content/writing/*.mdx` are MDX
 * (frontmatter + body), and `skills.json`/`gaps.json`/`education.json` are
 * JSON arrays.
 */
const contentLayout: ContentLayoutEntry[] = [
  { entityType: "profile", kind: "single-json", relPath: "profile.json", schema: profileSchema },
  {
    entityType: "experience",
    kind: "per-file-json",
    dir: "experience",
    schema: experienceEntrySchema,
  },
  { entityType: "project", kind: "per-file-mdx", dir: "projects", schema: projectSchema },
  { entityType: "skill", kind: "array-json", relPath: "skills.json", schema: skillSchema.array() },
  { entityType: "gap", kind: "array-json", relPath: "gaps.json", schema: gapSchema.array() },
  {
    entityType: "education",
    kind: "array-json",
    relPath: "education.json",
    schema: educationEntrySchema.array(),
  },
  { entityType: "writing", kind: "per-file-mdx", dir: "writing", schema: writingEntrySchema },
];

/** Formats a Zod issue path as a readable field path, e.g. `[0].evidence`. */
function formatIssuePath(issuePath: ReadonlyArray<string | number | symbol>): string {
  if (issuePath.length === 0) {
    return "(root)";
  }
  return issuePath.reduce<string>((acc, segment, index) => {
    if (typeof segment === "number") {
      return `${acc}[${segment}]`;
    }
    return index === 0 ? String(segment) : `${acc}.${String(segment)}`;
  }, "");
}

function validateParsed(
  data: unknown,
  schema: z.ZodType,
  file: string,
  errors: ContentValidationError[],
): void {
  const result = schema.safeParse(data);
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push({ file, path: formatIssuePath(issue.path), message: issue.message });
    }
  }
}

function parseJsonFile(
  absPath: string,
  relPath: string,
  errors: ContentValidationError[],
): unknown | undefined {
  const raw = fs.readFileSync(absPath, "utf-8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    errors.push({
      file: relPath,
      path: "(root)",
      message: `invalid JSON: ${(error as Error).message}`,
    });
    return undefined;
  }
}

function parseMdxFile(
  absPath: string,
  relPath: string,
  errors: ContentValidationError[],
): unknown | undefined {
  const raw = fs.readFileSync(absPath, "utf-8");
  try {
    const parsed = matter(raw);
    return { ...parsed.data, body: parsed.content.trim() };
  } catch (error) {
    errors.push({
      file: relPath,
      path: "(root)",
      message: `invalid MDX frontmatter: ${(error as Error).message}`,
    });
    return undefined;
  }
}

function validateSingleFile(
  contentDir: string,
  entry: Extract<ContentLayoutEntry, { kind: "single-json" | "array-json" }>,
  errors: ContentValidationError[],
): void {
  const absPath = path.join(contentDir, entry.relPath);
  if (!fs.existsSync(absPath)) {
    return;
  }
  const data = parseJsonFile(absPath, entry.relPath, errors);
  if (data !== undefined) {
    validateParsed(data, entry.schema, entry.relPath, errors);
  }
}

function validatePerFileDir(
  contentDir: string,
  entry: Extract<ContentLayoutEntry, { kind: "per-file-json" | "per-file-mdx" }>,
  errors: ContentValidationError[],
): void {
  const dirAbs = path.join(contentDir, entry.dir);
  if (!fs.existsSync(dirAbs)) {
    return;
  }
  const ext = entry.kind === "per-file-mdx" ? ".mdx" : ".json";
  const files = fs.readdirSync(dirAbs).filter((file) => file.endsWith(ext));
  for (const file of files) {
    const relPath = path.join(entry.dir, file);
    const absPath = path.join(dirAbs, file);
    const data =
      entry.kind === "per-file-mdx"
        ? parseMdxFile(absPath, relPath, errors)
        : parseJsonFile(absPath, relPath, errors);
    if (data !== undefined) {
      validateParsed(data, entry.schema, relPath, errors);
    }
  }
}

/**
 * Loads and validates every content file under `contentDir` against the
 * schema for its entity type, per the layout above. Missing files/directories
 * are skipped (content is authored in later tasks); this never throws — every
 * failure (parse error or schema violation) is collected and returned, not
 * just the first.
 */
export function validateContentDir(contentDir: string): ContentValidationError[] {
  const errors: ContentValidationError[] = [];
  for (const entry of contentLayout) {
    if (entry.kind === "single-json" || entry.kind === "array-json") {
      validateSingleFile(contentDir, entry, errors);
    } else {
      validatePerFileDir(contentDir, entry, errors);
    }
  }
  return errors;
}

/** Every entity type's content, loaded and validated, keyed by entity kind. */
export interface CareerDataset {
  /** `undefined` when `profile.json` has not been authored yet. */
  profile: Profile | undefined;
  experience: ExperienceEntry[];
  projects: Project[];
  skills: Skill[];
  gaps: Gap[];
  education: EducationEntry[];
  writing: WritingEntry[];
}

/** Which file backs a given loaded entity — the cross-reference the content lint (#51) needs to name an offending file per violation. */
export interface EntitySource {
  entityType: CitableEntityType;
  id: string;
  file: string;
}

function readSingleInto<T extends { id: string }>(
  contentDir: string,
  relPath: string,
  entityType: CitableEntityType,
  schema: z.ZodType<T>,
  assign: (value: T) => void,
  sources?: EntitySource[],
): void {
  const absPath = path.join(contentDir, relPath);
  if (!fs.existsSync(absPath)) {
    return;
  }
  const data = parseJsonFile(absPath, relPath, []);
  if (data !== undefined) {
    const value = schema.parse(data);
    assign(value);
    sources?.push({ entityType, id: value.id, file: relPath });
  }
}

function readArrayInto<T extends { id: string }>(
  contentDir: string,
  relPath: string,
  entityType: CitableEntityType,
  schema: z.ZodType<T[]>,
  target: T[],
  sources?: EntitySource[],
): void {
  const absPath = path.join(contentDir, relPath);
  if (!fs.existsSync(absPath)) {
    return;
  }
  const data = parseJsonFile(absPath, relPath, []);
  if (data !== undefined) {
    const parsed = schema.parse(data);
    target.push(...parsed);
    for (const value of parsed) {
      sources?.push({ entityType, id: value.id, file: relPath });
    }
  }
}

function readPerFileInto<T extends { id: string }>(
  contentDir: string,
  dir: string,
  ext: "json" | "mdx",
  entityType: CitableEntityType,
  schema: z.ZodType<T>,
  target: T[],
  sources?: EntitySource[],
): void {
  const dirAbs = path.join(contentDir, dir);
  if (!fs.existsSync(dirAbs)) {
    return;
  }
  const files = fs.readdirSync(dirAbs).filter((file) => file.endsWith(`.${ext}`));
  for (const file of files) {
    const relPath = path.join(dir, file);
    const absPath = path.join(dirAbs, file);
    const data =
      ext === "mdx" ? parseMdxFile(absPath, relPath, []) : parseJsonFile(absPath, relPath, []);
    if (data !== undefined) {
      const value = schema.parse(data);
      target.push(value);
      sources?.push({ entityType, id: value.id, file: relPath });
    }
  }
}

function formatValidationReport(errors: ContentValidationError[]): string {
  return errors.map((error) => `${error.file}: ${error.path}: ${error.message}`).join("\n");
}

/** {@link loadContentDirWithSources}'s return shape: the typed dataset plus its per-entity file provenance. */
export interface CareerDatasetWithSources {
  dataset: CareerDataset;
  sources: EntitySource[];
}

/**
 * Loads and validates every content file under `contentDir`, returning a
 * fully typed {@link CareerDataset} together with an {@link EntitySource}
 * per loaded entity — which file it came from, keyed by entity type and id.
 * The content lint (#51) uses this provenance to name an offending file per
 * rule violation. Like `loadContentDir`, this fails fast: a single invalid
 * file throws with a readable report naming every failure, since callers
 * want a fully valid dataset, not a partial one.
 *
 * Missing files/directories are not an error (content may not be authored
 * yet); their slot in the dataset is `undefined`/`[]` and contributes no
 * sources.
 */
export function loadContentDirWithSources(contentDir: string): CareerDatasetWithSources {
  const errors = validateContentDir(contentDir);
  if (errors.length > 0) {
    throw new Error(`career-data: cannot load invalid content:\n${formatValidationReport(errors)}`);
  }

  const dataset: CareerDataset = {
    profile: undefined,
    experience: [],
    projects: [],
    skills: [],
    gaps: [],
    education: [],
    writing: [],
  };
  const sources: EntitySource[] = [];

  readSingleInto(
    contentDir,
    "profile.json",
    "profile",
    profileSchema,
    (value) => {
      dataset.profile = value;
    },
    sources,
  );
  readPerFileInto(
    contentDir,
    "experience",
    "json",
    "experience",
    experienceEntrySchema,
    dataset.experience,
    sources,
  );
  readPerFileInto(
    contentDir,
    "projects",
    "mdx",
    "project",
    projectSchema,
    dataset.projects,
    sources,
  );
  readArrayInto(contentDir, "skills.json", "skill", skillSchema.array(), dataset.skills, sources);
  readArrayInto(contentDir, "gaps.json", "gap", gapSchema.array(), dataset.gaps, sources);
  readArrayInto(
    contentDir,
    "education.json",
    "education",
    educationEntrySchema.array(),
    dataset.education,
    sources,
  );
  readPerFileInto(
    contentDir,
    "writing",
    "mdx",
    "writing",
    writingEntrySchema,
    dataset.writing,
    sources,
  );

  return { dataset, sources };
}

/**
 * Loads and validates every content file under `contentDir`, returning a
 * fully typed {@link CareerDataset}. A thin wrapper over
 * {@link loadContentDirWithSources} for callers that only need the data,
 * not its file provenance.
 */
export function loadContentDir(contentDir: string): CareerDataset {
  return loadContentDirWithSources(contentDir).dataset;
}
