/**
 * Design-token color values as plain string constants, for the handful of
 * non-CSS contexts #44 needs literal hex in: `next/og`'s `ImageResponse`
 * (satori doesn't resolve `var(--token)`), the `themeColor`/manifest
 * `theme_color`/`background_color` fields of the Metadata API. Values are
 * kept in lockstep with `app/globals.css`'s `--color-*` custom properties —
 * this file, not `globals.css`, is the one non-CSS place allowed to hold a
 * raw hex literal (`app/design-system/lib/no-hardcoded-hex.test.ts` only
 * scans `app/**`, so re-exporting these as named constants from here, then
 * importing them into `app/*`, keeps that rule meaningful instead of
 * working around it).
 */

export const COLOR_BG_LIGHT = "#f7f5f0";
export const COLOR_BG_DARK = "#16140f";
export const COLOR_ACCENT = "#b5541f";
export const COLOR_ACCENT_FG = "#fff8f0";
