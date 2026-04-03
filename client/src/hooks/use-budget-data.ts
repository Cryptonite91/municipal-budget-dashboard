import { useQuery } from "@tanstack/react-query";
import { useTenantSlug } from "./use-tenant";
import type { Municipality, DepartmentBudget, RevenueSource, CapitalProject, CitizenComment } from "@shared/schema";

// Build a tenant-scoped query key
export function tKey(path: string, slug: string): string[] {
  return [`${path}?tenant=${slug}`];
}

export function useMunicipality() {
  const slug = useTenantSlug();
  return useQuery<Omit<Municipality, "adminPasswordHash">>({
    queryKey: tKey("/api/municipality", slug),
  });
}

// Alias for backwards compat
export const useYears = useAvailableYears;

export function useAvailableYears() {
  const slug = useTenantSlug();
  return useQuery<string[]>({ queryKey: tKey("/api/years", slug) });
}

export function useSummary(year: string) {
  const slug = useTenantSlug();
  return useQuery<any>({
    queryKey: tKey(`/api/summary/${year}`, slug),
    enabled: !!year,
  });
}

export function useRevenueSources(year: string) {
  const slug = useTenantSlug();
  return useQuery<RevenueSource[]>({
    queryKey: tKey(`/api/revenue/${year}`, slug),
    enabled: !!year,
  });
}

// Alias used by revenue.tsx
export const useRevenue = useRevenueSources;

export function useDepartmentBudgets(year: string) {
  const slug = useTenantSlug();
  return useQuery<DepartmentBudget[]>({
    queryKey: tKey(`/api/departments/${year}`, slug),
    enabled: !!year,
  });
}

// Alias used by spending.tsx
export const useDepartments = useDepartmentBudgets;

export function useAllDepartmentBudgets() {
  const slug = useTenantSlug();
  return useQuery<DepartmentBudget[]>({ queryKey: tKey("/api/departments", slug) });
}

export function useCapitalProjects() {
  const slug = useTenantSlug();
  return useQuery<CapitalProject[]>({ queryKey: tKey("/api/projects", slug) });
}

export function usePublicComments() {
  const slug = useTenantSlug();
  return useQuery<CitizenComment[]>({ queryKey: tKey("/api/comments", slug) });
}

export function formatCurrency(n: number, long = false): string {
  if (!long) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
    return `$${n.toFixed(0)}`;
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export function formatPercent(n: number): string {
  return `${n.toFixed(1)}%`;
}
