/**
 * Builds {@link Citation}s from real entities in the repository's dataset, so
 * every future domain service produces citations the same way instead of
 * hand-rolling the shape (and risking a citation that points at nothing).
 */

import type { CitableEntityType, Citation } from "@hire-me-mcp/career-data";
import type { CareerDataRepository, CareerDataset } from "./repository.js";

/** Thrown by {@link buildCitation} when `entityId` does not resolve to a real entity. */
export class UnknownEntityError extends Error {
  readonly entityType: CitableEntityType;
  readonly entityId: string;

  constructor(entityType: CitableEntityType, entityId: string) {
    super(`career-data: unknown ${entityType} entity "${entityId}" — no citation can be built`);
    this.name = "UnknownEntityError";
    this.entityType = entityType;
    this.entityId = entityId;
  }
}

/** Whether `entityId` resolves to a real entity of `entityType`, plus its derived label if so. */
interface EntityLookup {
  found: boolean;
  label: string | undefined;
}

function lookupEntity(
  dataset: CareerDataset,
  entityType: CitableEntityType,
  entityId: string,
): EntityLookup {
  switch (entityType) {
    case "profile":
      return dataset.profile?.id === entityId
        ? { found: true, label: dataset.profile.name }
        : { found: false, label: undefined };
    case "experience": {
      const entry = dataset.experience.find((item) => item.id === entityId);
      return entry
        ? { found: true, label: `${entry.role}, ${entry.company}` }
        : { found: false, label: undefined };
    }
    case "project": {
      const entry = dataset.projects.find((item) => item.id === entityId);
      return { found: entry !== undefined, label: entry?.name };
    }
    case "skill": {
      const entry = dataset.skills.find((item) => item.id === entityId);
      return { found: entry !== undefined, label: entry?.name };
    }
    case "gap": {
      const entry = dataset.gaps.find((item) => item.id === entityId);
      return { found: entry !== undefined, label: entry?.name };
    }
    case "education": {
      const entry = dataset.education.find((item) => item.id === entityId);
      return entry
        ? { found: true, label: `${entry.credential}, ${entry.institution}` }
        : { found: false, label: undefined };
    }
    case "writing": {
      const entry = dataset.writing.find((item) => item.id === entityId);
      return { found: entry !== undefined, label: entry?.title };
    }
    default:
      return { found: false, label: undefined };
  }
}

export interface BuildCitationOptions {
  /** Anchor into a sub-part of the entity, e.g. `evidence.0`. */
  fragment?: string;
  /** Overrides the label derived from the entity's own fields. */
  label?: string;
}

/**
 * Resolves `entityId` against `repository`'s dataset and returns a
 * {@link Citation} pointing at it. Throws {@link UnknownEntityError} — rather
 * than silently building a dangling citation — when no entity of that type
 * with that id exists.
 */
export function buildCitation(
  repository: CareerDataRepository,
  entityType: CitableEntityType,
  entityId: string,
  options: BuildCitationOptions = {},
): Citation {
  const { found, label } = lookupEntity(repository.getDataset(), entityType, entityId);
  if (!found) {
    throw new UnknownEntityError(entityType, entityId);
  }

  return {
    entityType,
    entityId,
    label: options.label ?? (label as string),
    ...(options.fragment === undefined ? {} : { fragment: options.fragment }),
  };
}
