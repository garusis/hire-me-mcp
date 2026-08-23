/**
 * Percentile-over-a-sample helper for the latency budget specs (#62):
 * MCP read-tool and chat time-to-first-stream-event latency are asserted as
 * a percentile over several repeated calls (never a single sample — see
 * `apps/web/e2e-preview/specs/latency.spec.ts` and the "latency" section of
 * the committed `performance-budgets.json`), so this is the one place that
 * math is implemented and unit-tested independently of any real network
 * call.
 *
 * Linear-interpolation percentile (the "R-7"/Excel `PERCENTILE.INC`
 * method) over a sorted copy of `values` — a standard, deterministic
 * definition, not the nearest-rank method, so p75 over a small sample
 * (5-6 calls, as this repo's latency specs use) doesn't degenerate to
 * picking a single raw sample.
 */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) {
    throw new Error("percentile: values must not be empty.");
  }
  if (p < 0 || p > 100) {
    throw new Error(`percentile: p must be between 0 and 100, got ${p}.`);
  }

  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) {
    return sorted[0] as number;
  }

  const rank = (p / 100) * (sorted.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  const lower = sorted[lowerIndex] as number;
  const upper = sorted[upperIndex] as number;
  const fraction = rank - lowerIndex;
  return lower + (upper - lower) * fraction;
}
