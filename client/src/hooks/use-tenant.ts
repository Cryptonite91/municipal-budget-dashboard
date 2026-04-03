/**
 * Tenant resolution hook.
 *
 * The active tenant slug lives in the REAL URL query string (window.location.search),
 * NOT inside the hash. This keeps wouter's hash-based routing intact.
 *
 * URL pattern: http://localhost:5000/?tenant=maplewood-vt  (hash route: /#/revenue)
 * Falls back to "maplewood-vt" for demo purposes.
 */
import { useState, useEffect } from "react";

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
