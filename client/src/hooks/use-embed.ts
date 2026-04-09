/**
 * Embed mode hook.
 *
 * URL params (on the real search string, same as tenant):
 *   ?embed=1          — activates embed mode (hides sidebar + header chrome)
 *   &view=overview|revenue|spending|comparison|projects  — which tab to show (default: overview)
 *   &year=2026        — lock to a specific year
 *   &theme=light|dark — force theme
 *   &tenant=slug      — municipality (already handled by useTenantSlug)
 *
 * Example:  ?tenant=maplewood-vt&embed=1&view=spending&year=2026&theme=dark
 */
import { useMemo } from "react";

export type EmbedView = "overview" | "revenue" | "spending" | "comparison" | "projects";

export interface EmbedParams {
  isEmbed: boolean;
  view: EmbedView;
  year: string | null;
  theme: "light" | "dark" | null;
}

function readParams(): EmbedParams {
  if (typeof window === "undefined")
    return { isEmbed: false, view: "overview", year: null, theme: null };
  const p = new URLSearchParams(window.location.search);
  const isEmbed = p.get("embed") === "1";
  const rawView = (p.get("view") || "overview").toLowerCase();
  const view: EmbedView = ["overview", "revenue", "spending", "comparison", "projects"].includes(rawView)
    ? (rawView as EmbedView)
    : "overview";
  const year = p.get("year") || null;
  const rawTheme = p.get("theme");
  const theme: "light" | "dark" | null =
    rawTheme === "light" || rawTheme === "dark" ? rawTheme : null;
  return { isEmbed, view, year, theme };
}

/** Returns embed parameters. Stable for the lifetime of the page load. */
export function useEmbedMode(): EmbedParams {
  return useMemo(() => readParams(), []);
}

/** Non-hook version for use outside React (e.g. ThemeProvider init). */
export function getEmbedParams(): EmbedParams {
  return readParams();
}

/**
 * Returns the year from ?year= param or empty string.
 * Used to initialize year state in page components so embed can lock a year.
 */
export function getInitialYear(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("year") || "";
}
