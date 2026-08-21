/**
 * Marker-based injector for generated content (#17): replaces everything
 * between a `<!-- BEGIN GENERATED: <id> --> ... <!-- END GENERATED: <id> -->`
 * marker pair in a target file's text with freshly rendered content,
 * leaving everything else untouched. `checkGeneratedRegions` is the
 * `--check` half: it reports which regions differ from what a fresh render
 * would produce, without writing anything.
 *
 * Idempotent by construction — each call fully replaces the span between
 * the markers (never appends), so injecting the same regions twice
 * produces byte-identical output to injecting once.
 */

export interface GeneratedRegion {
  id: string;
  content: string;
}

export class MarkerNotFoundError extends Error {
  constructor(id: string) {
    super(`No BEGIN/END GENERATED marker pair found for region "${id}".`);
    this.name = "MarkerNotFoundError";
  }
}

export class MalformedMarkerError extends Error {
  constructor(id: string, reason: string) {
    super(`Malformed GENERATED marker pair for region "${id}": ${reason}`);
    this.name = "MalformedMarkerError";
  }
}

function beginMarker(id: string): string {
  return `<!-- BEGIN GENERATED: ${id} -->`;
}

function endMarker(id: string): string {
  return `<!-- END GENERATED: ${id} -->`;
}

function injectOne(source: string, region: GeneratedRegion): string {
  const begin = beginMarker(region.id);
  const end = endMarker(region.id);
  const beginIndex = source.indexOf(begin);
  const endIndex = source.indexOf(end);

  if (beginIndex === -1 && endIndex === -1) {
    throw new MarkerNotFoundError(region.id);
  }
  if (beginIndex === -1) {
    throw new MalformedMarkerError(region.id, "found an END marker but no matching BEGIN marker");
  }
  if (endIndex === -1) {
    throw new MalformedMarkerError(region.id, "found a BEGIN marker but no matching END marker");
  }
  if (endIndex < beginIndex) {
    throw new MalformedMarkerError(region.id, "the END marker appears before the BEGIN marker");
  }

  const before = source.slice(0, beginIndex + begin.length);
  const after = source.slice(endIndex);
  return `${before}\n${region.content}\n${after}`;
}

/** Replaces each region's marked span in `source` with its rendered `content`, in order. */
export function injectGeneratedRegions(source: string, regions: GeneratedRegion[]): string {
  return regions.reduce((current, region) => injectOne(current, region), source);
}

/**
 * Renders `regions` into `source` and reports which region ids ended up
 * different from `source` as given — the `--check` mode the generator CLI
 * exits non-zero on when any id is returned.
 */
export function checkGeneratedRegions(
  source: string,
  regions: GeneratedRegion[],
): { drifted: string[] } {
  const drifted = regions
    .filter((region) => extractRegionSpan(source, region.id) !== `\n${region.content}\n`)
    .map((region) => region.id);
  return { drifted };
}

function extractRegionSpan(source: string, id: string): string {
  const begin = beginMarker(id);
  const end = endMarker(id);
  const beginIndex = source.indexOf(begin);
  const endIndex = source.indexOf(end);
  if (beginIndex === -1 || endIndex === -1 || endIndex < beginIndex) {
    throw new MarkerNotFoundError(id);
  }
  return source.slice(beginIndex + begin.length, endIndex);
}
