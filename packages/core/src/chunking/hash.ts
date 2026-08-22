/**
 * Deterministic id/hash derivation for the career-data chunker (#21).
 *
 * Uses `node:crypto`'s `createHash` — a Node builtin, not an npm
 * dependency, so it needs no entry in `packages/core`'s dependency
 * allowlist (see `allowed-dependencies.json`, and `repository.ts`'s
 * existing `node:fs`/`node:path` usage for precedent). This keeps
 * `chunkCareerData` "pure" in the sense that matters for #21: no I/O, no
 * network, no env access, and no external dependency — its tests need no
 * database or API key. It does mean this module cannot run in an
 * environment without `node:crypto` (e.g. a stripped-down edge runtime);
 * `packages/core` already assumes a Node-ish runtime elsewhere (see
 * `repository.ts`), so this is consistent with the package's existing
 * environment assumptions, not a new one.
 */

import { createHash } from "node:crypto";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Derives a stable chunk id from `sourceType:sourceId:chunkIndex` — the
 * exact triple named by #21's acceptance criteria. Same triple always
 * produces the same id, independent of the chunk's text (so re-chunking
 * after a content edit that doesn't change `chunkIndex` keeps the same id,
 * letting the ingestion pipeline treat it as an update rather than a new
 * row).
 */
export function computeChunkId(sourceType: string, sourceId: string, chunkIndex: number): string {
  return sha256Hex(`${sourceType}:${sourceId}:${chunkIndex}`);
}

/**
 * Hashes a chunk's already-normalized text (see `./text.ts`'s
 * `normalizeText`). Callers must normalize before calling this — hashing
 * un-normalized text would defeat the whole point of normalization
 * (whitespace-only edits would then change the hash).
 */
export function computeContentHash(normalizedText: string): string {
  return sha256Hex(normalizedText);
}
