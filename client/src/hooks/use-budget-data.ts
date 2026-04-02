import { useQuery } from "@tanstack/react-query";
import type { Municipality, RevenueSource, DepartmentBudget, CapitalProject } from "@shared/schema";

export function useMunicipality() {
  return useQuery<Municipality>({ queryKey: ["/api/municipality"] });
}

export function useYears() {
  return useQuery<string[]>({ queryKey: ["/api/years"] });
}

export function useRevenue(year: string) {
  return useQuery<RevenueSource[]>({
    queryKey: ["/api/revenue", year],
    enabled: !!year,
  });
}

export function useDepartments(year: string) {
  return useQuery<DepartmentBudget[]>({
    queryKey: ["/api/departments", year],
    enabled: !!year,
  });
}

export function useCapitalProjects() {
  return useQuery<CapitalProject[]>({ queryKey: ["/api/projects"] });
}

export interface SummaryData {
  totalBudget: number;
  totalSpent: number;
  totalRevenueBudgeted: number;
  totalRevenueCollected: number;
  yoyChange: number;
  percentSpent: number;
  budgetReserve: number;
  costPerResident: number;
  revenueEfficiency: number;
  topDepartments: string[];
  departments: { name: string; budgeted: number; spent: number }[];
  population: number;
  municipalityName: string;
}

export function useSummary(year: string) {
  return useQuery<SummaryData>({
    queryKey: ["/api/summary", year],
    enabled: !!year,
  });
}

export function formatCurrency(val: number, compact = false): string {
  if (compact) {
    if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(0)}K`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
}

export function formatPercent(val: number): string {
  return `${val >= 0 ? "+" : ""}${val.toFixed(1)}%`;
}
