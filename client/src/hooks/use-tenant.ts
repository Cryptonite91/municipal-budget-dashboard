/**
 * Tenant resolution hook.
 *
 * The active tenant slug lives in the REAL URL query string (window.location.search),
 * NOT inside the hash. This keeps wouter's hash-based routing intact.
 *
 * URL pattern: http://localhost:5000/?tenant=maplewood-vt  (hash route: /#/revenue)
 * Falls back to "maplewood-vt" for demo purposes.
 *
 * Recovery: if someone arrives with tenant inside the hash (e.g. /#/admin?tenant=foo
 * or /#/?tenant=foo), we detect it on first render and redirect to the correct format
 * (?tenant=foo#/admin) so wouter can match the route correctly.
 */
import { useState, useEffect } from "react";

/**
 * If tenant is embedded in the hash query string, extract it and redirect to
 * the canonical format: ?tenant=<slug>#/<hash-path>
 * Returns true if a redirect was performed (caller should abort rendering).
 */
function fixHashTenant(): void {
  if (typeof window === "undefined") return;

  // Parse tenant from real search string first
  const search = new URLSearchParams(window.location.search);
  if (search.get("tenant")) return; // already correct — nothing to do

  // Check if tenant is embedded in the hash: /#/<path>?tenant=<slug>
  const hash = window.location.hash; // e.g. "#/admin?tenant=essex-junction-vermont"
  const hashNoLeading = hash.startsWith("#") ? hash.slice(1) : hash; // "/admin?tenant=..."
  const qIdx = hashNoLeading.indexOf("?");
  if (qIdx === -1) return; // no query string in hash

  const hashPath = hashNoLeading.slice(0, qIdx);           // "/admin"
  const hashSearch = new URLSearchParams(hashNoLeading.slice(qIdx + 1));
  const tenant = hashSearch.get("tenant");
  if (!tenant) return;

  // Rebuild URL: move tenant to real search, keep hash path clean
  const url = new URL(window.location.href);
  url.search = `?tenant=${encodeURIComponent(tenant)}`;
  url.hash = `#${hashPath}`;
  window.location.replace(url.toString());
}

// Run the fix synchronously on module load (before React renders)
fixHashTenant();

function readTenantFromSearch(): string {
  if (typeof window === "undefined") return "maplewood-vt";
  const params = new URLSearchParams(window.location.search);
  return params.get("tenant") || "maplewood-vt";
}

export function useTenantSlug(): string {
  const [slug, setSlug] = useState<string>(readTenantFromSearch);

  useEffect(() => {
    // Re-read on popstate (browser back/forward), though in practice
    // tenant doesn't change during a session.
    const handler = () => setSlug(readTenantFromSearch());
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  return slug;
}

/** Build a query string suffix that forwards the tenant. */
export function useTenantParam(): string {
  const slug = useTenantSlug();
  return `tenant=${slug}`;
}
