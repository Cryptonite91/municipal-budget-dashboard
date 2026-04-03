/**
 * API base URL — injected by Vite at build time via VITE_API_BASE.
 * - Development: empty string → relative /api calls hit the Vite dev server proxy
 * - Production: https://municipal-budget-dashboard-production.up.railway.app
 */
export const API_BASE: string = import.meta.env.VITE_API_BASE ?? "";
