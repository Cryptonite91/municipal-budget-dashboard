/**
 * Shared year normalization and display utilities.
 *
 * All year values in this app are plain 4-digit integers stored and displayed
 * as strings like "2026". This module is the single place that converts any
 * incoming year-like string into that canonical form.
 */

/**
 * Normalize any year-like string to a plain 4-digit year string.
 *
 * Examples:
 *   "FY2026"            → "2026"
 *   "FY 2026"           → "2026"
 *   "Fiscal Year 2026"  → "2026"
 *   "2026 Adopted Budget" → "2026"
 *   "2025-2026"         → "2025"  (takes the first 4-digit year)
 *   "FY26"              → ""      (short form — no 4-digit match)
 *   ""                  → ""
 *   null / undefined    → ""
 */
export function normalizeYear(raw: unknown): string {
  const s = String(raw ?? "").trim();
  // Prefer the first 20xx value found anywhere in the string
  const m = s.match(/\b(20\d{2})\b/);
  if (m) return m[1];
  // Strip known prefixes and return whatever's left
  return s
    .replace(/^Fiscal\s+Year\s+/i, "")
    .replace(/^FY\s*/i, "")
    .trim();
}

/**
 * Canonical list of selectable years shown in dropdowns.
 * Add future years here as needed.
 */
export const SELECTABLE_YEARS = ["2027", "2026", "2025", "2024", "2023", "2022", "2021"] as const;
