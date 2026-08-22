/** CLI flag parsing for the `pnpm ingest` entry point (#24). Pure — no `process.argv` access. */

export interface IngestArgs {
  dryRun: boolean;
  full: boolean;
}

/** Thrown for any argv entry that isn't a recognized flag. */
export class InvalidIngestArgError extends Error {
  constructor(arg: string) {
    super(`Unrecognized argument: "${arg}". Expected --dry-run and/or --full.`);
    this.name = "InvalidIngestArgError";
  }
}

/** Parses `process.argv.slice(2)`-style argv into {@link IngestArgs}. */
export function parseIngestArgs(argv: readonly string[]): IngestArgs {
  let dryRun = false;
  let full = false;
  for (const arg of argv) {
    // pnpm's `pnpm ingest -- --dry-run` (root script forwarding into
    // `pnpm --filter core ingest -- --dry-run`) can hand this script a
    // literal leading "--" passthrough separator — ignore it rather than
    // treating it as an unrecognized flag.
    if (arg === "--") {
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--full") {
      full = true;
    } else {
      throw new InvalidIngestArgError(arg);
    }
  }
  return { dryRun, full };
}
