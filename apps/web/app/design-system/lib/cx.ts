export type ClassValue = string | false | null | undefined;

/** Minimal className joiner — avoids pulling in a dependency for this. */
export function cx(...values: ClassValue[]): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}
