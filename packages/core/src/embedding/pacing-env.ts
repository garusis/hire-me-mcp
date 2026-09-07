/**
 * `EMBED_MAX_TEXTS_PER_MINUTE` loader (#317) — the ingestion pacing limit
 * consumed by `pacing.ts`'s `createPacedEmbedder`. Defaults to 80, a
 * margin below Gemini's free-tier
 * `EmbedContentRequestsPerMinutePerUserPerProjectPerModel` limit of 100
 * (the quota counts texts, not calls — see issue #317). Deliberately
 * simple: unlike some rate-limit knobs, there is no "off" value (`0` or
 * `"off"`) — pacing is always on when this loader is used.
 */

export type EmbedPacingEnvSource = Readonly<Record<string, string | undefined>>;

/** Thrown when `EMBED_MAX_TEXTS_PER_MINUTE` is set but isn't a positive integer. */
export class InvalidEmbedPacingError extends Error {
  constructor(rawValue: string) {
    super(
      `EMBED_MAX_TEXTS_PER_MINUTE must be a positive integer (e.g. "80"), got "${rawValue}". ` +
        'There is no "off" value — pacing is always applied.',
    );
    this.name = "InvalidEmbedPacingError";
  }
}

const DEFAULT_MAX_TEXTS_PER_MINUTE = 80;

/** Reads and validates `EMBED_MAX_TEXTS_PER_MINUTE` (defaults to `process.env`). Defaults to 80 when unset. */
export function loadEmbedMaxTextsPerMinute(env: EmbedPacingEnvSource = process.env): number {
  const raw = env.EMBED_MAX_TEXTS_PER_MINUTE?.trim();
  if (raw === undefined || raw === "") {
    return DEFAULT_MAX_TEXTS_PER_MINUTE;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidEmbedPacingError(raw);
  }
  return parsed;
}
