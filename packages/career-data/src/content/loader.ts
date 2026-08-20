import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { z } from "zod";
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

function readSingleInto<T>(
  contentDir: string,
  relPath: string,
  schema: z.ZodType<T>,
  assign: (value: T) => void,
): void {
  const absPath = path.join(contentDir, relPath);
  if (!fs.existsSync(absPath)) {
    return;
  }
  const data = parseJsonFile(absPath, relPath, []);
  if (data !== undefined) {
    assign(schema.parse(data));
  }
}

function readArrayInto<T>(
  contentDir: string,
  relPath: string,
  schema: z.ZodType<T[]>,
  target: T[],
): void {
  const absPath = path.join(contentDir, relPath);
  if (!fs.existsSync(absPath)) {
    return;
  }
  const data = parseJsonFile(absPath, relPath, []);
  if (data !== undefined) {
    target.push(...schema.parse(data));
  }
}

function readPerFileInto<T>(
  contentDir: string,
  dir: string,
  ext: "json" | "mdx",
  schema: z.ZodType<T>,
  target: T[],
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
      target.push(schema.parse(data));
    }
  }
}

function formatValidationReport(errors: ContentValidationError[]): string {
  return errors.map((error) => `${error.file}: ${error.path}: ${error.message}`).join("\n");
}

/**
 * Loads and validates every content file under `contentDir`, returning a
 * fully typed {@link CareerDataset}. Unlike `validateContentDir` — which
 * collects every failure for reporting — this fails fast: callers want data,
 * not a partial or invalid dataset, so a single invalid file throws with a
 * readable report naming every failure.
 *
 * Missing files/directories are not an error (content may not be authored
 * yet); their slot in the dataset is `undefined`/`[]`.
 */
export function loadContentDir(contentDir: string): CareerDataset {
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

  readSingleInto(contentDir, "profile.json", profileSchema, (value) => {
    dataset.profile = value;
  });
  readPerFileInto(contentDir, "experience", "json", experienceEntrySchema, dataset.experience);
  readPerFileInto(contentDir, "projects", "mdx", projectSchema, dataset.projects);
  readArrayInto(contentDir, "skills.json", skillSchema.array(), dataset.skills);
  readArrayInto(contentDir, "gaps.json", gapSchema.array(), dataset.gaps);
  readArrayInto(contentDir, "education.json", educationEntrySchema.array(), dataset.education);
  readPerFileInto(contentDir, "writing", "mdx", writingEntrySchema, dataset.writing);

  return dataset;
}
