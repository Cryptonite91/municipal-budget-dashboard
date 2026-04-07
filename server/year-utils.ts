/**
 * Server-side year normalization.
 * Mirrors client/src/lib/year-utils.ts — keep in sync.
 *
 * Converts any year-like string to a plain 4-digit year string, e.g.:
 *   "FY2026"             → "2026"
 *   "Fiscal Year 2026"   → "2026"
 *   "2026 Adopted Budget"→ "2026"
 *   "2025-2026"          → "2025"
 *   ""                   → ""
 */
export function normalizeYear(raw: unknown): string {
  const s = String(raw ?? "").trim();
  const m = s.match(/\b(20\d{2})\b/);
  if (m) return m[1];
  return s
    .replace(/^Fiscal\s+Year\s+/i, "")
    .replace(/^FY\s*/i, "")
    .trim();
}
