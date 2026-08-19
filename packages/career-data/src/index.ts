/**
 * Zod-typed career content package.
 *
 * This is an empty shell — real schemas and content land in the
 * Career Data epic (#2). For now it only exports a placeholder value
 * so consumers can prove the workspace wiring resolves.
 */

/** Name of this package, exported as a trivial placeholder value. */
export const CAREER_DATA_PACKAGE_NAME = "@hire-me-mcp/career-data";

/**
 * Format a career-history year range as displayable text, e.g. `2021 – Present`
 * or `2019 – 2021`. `end` omitted (or `undefined`) means the role is current.
 *
 * A small but real piece of domain logic — used to prove the Vitest pipeline
 * exercises actual exported behavior, ahead of the real schemas landing in #2.
 */
export function formatYearRange(start: number, end?: number): string {
  if (!Number.isInteger(start)) {
    throw new RangeError(`start must be an integer year, got ${start}`);
  }
  if (end !== undefined) {
    if (!Number.isInteger(end)) {
      throw new RangeError(`end must be an integer year, got ${end}`);
    }
    if (end < start) {
      throw new RangeError(`end (${end}) must not be before start (${start})`);
    }
  }

  return `${start} – ${end === undefined ? "Present" : end}`;
}
