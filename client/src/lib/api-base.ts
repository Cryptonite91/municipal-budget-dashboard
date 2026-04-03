/**
 * API base URL.
 * - In development (Vite dev server): empty string (relative /api calls hit same origin)
 * - In production with Railway: set VITE_API_BASE at build time
 * - Falls back to empty string (same-origin) if not set
 */
export const API_BASE: string =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_BASE) || "";
