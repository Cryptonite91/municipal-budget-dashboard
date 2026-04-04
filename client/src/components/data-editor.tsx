/**
 * DataEditor — Inline admin table editor for revenue, departments, and projects.
 *
 * Features:
 *  - Live inline editing with dirty-tracking per cell
 *  - Validation warnings (non-blocking) highlighted in amber
 *  - "Commit changes" button → change-summary dialog → confirm → bulk API call
 *  - Per-section CSV export
 *  - Year selector for multi-year data
 *  - Delete rows with confirmation
 */

import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { tKey } from "@/hooks/use-budget-data";
import { API_BASE } from "@/lib/api-base";
import type { RevenueSource, DepartmentBudget, CapitalProject } from "@shared/schema";
import {
  AlertTriangle, CheckCircle2, Download, Edit3, Save, X, Trash2,
  ChevronDown, ChevronUp, Info, TrendingUp, TrendingDown, AlertCircle, Plus,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const pct = (n: number) => `${n.toFixed(1)}%`;

function authFetch(url: string, token: string | null, opts: RequestInit = {}) {
  return fetch(`${API_BASE}${url}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers as Record<string, string> || {}),
    },
  });
}

// ─── Validation rules ─────────────────────────────────────────────────────────
interface Warning { field: string; message: string; severity: "warn" | "info" }

function validateRevenue(row: RevenueSource, draft: Partial<RevenueSource>): Warning[] {
  const warnings: Warning[] = [];
  const budgeted = draft.budgetedAmount ?? row.budgetedAmount;
  const collected = draft.collectedAmount ?? row.collectedAmount;
  if (budgeted < 0) warnings.push({ field: "budgetedAmount", message: "Budgeted amount is negative", severity: "warn" });
  if (collected < 0) warnings.push({ field: "collectedAmount", message: "Collected amount is negative", severity: "warn" });
  if (budgeted > 0 && collected > budgeted * 1.5)
    warnings.push({ field: "collectedAmount", message: `Collected (${fmt(collected)}) is >150% of budget — verify this figure`, severity: "warn" });
  if (budgeted > 0 && collected > budgeted)
    warnings.push({ field: "collectedAmount", message: `Collected exceeds budgeted amount by ${fmt(collected - budgeted)}`, severity: "info" });
  if (budgeted === 0 && collected > 0)
    warnings.push({ field: "budgetedAmount", message: "Budget is $0 but collection amount is set", severity: "warn" });
  if (!((draft.source ?? row.source) || "").trim())
    warnings.push({ field: "source", message: "Source name cannot be empty", severity: "warn" });
  return warnings;
}

function validateDepartment(row: DepartmentBudget, draft: Partial<DepartmentBudget>): Warning[] {
  const warnings: Warning[] = [];
  const budgeted = draft.budgetedAmount ?? row.budgetedAmount;
  const spent = draft.spentAmount ?? row.spentAmount;
  if (budgeted < 0) warnings.push({ field: "budgetedAmount", message: "Budgeted amount is negative", severity: "warn" });
  if (spent < 0) warnings.push({ field: "spentAmount", message: "Spent amount is negative", severity: "warn" });
  if (budgeted > 0 && spent > budgeted)
    warnings.push({ field: "spentAmount", message: `Over budget by ${fmt(spent - budgeted)} (${pct(((spent - budgeted) / budgeted) * 100)})`, severity: "warn" });
  if (budgeted > 0 && spent > budgeted * 1.25)
    warnings.push({ field: "spentAmount", message: `Spent is >125% of budget — significant overage`, severity: "warn" });
  if (budgeted === 0)
    warnings.push({ field: "budgetedAmount", message: "Budget is $0 — is this intentional?", severity: "info" });
  if (!((draft.department ?? row.department) || "").trim())
    warnings.push({ field: "department", message: "Department name cannot be empty", severity: "warn" });
  return warnings;
}

function validateProject(row: CapitalProject, draft: Partial<CapitalProject>): Warning[] {
  const warnings: Warning[] = [];
  const budget = draft.totalBudget ?? row.totalBudget;
  const spent = draft.spentToDate ?? row.spentToDate;
  const pctComplete = draft.percentComplete ?? row.percentComplete;
  const status = draft.status ?? row.status;
  if (budget < 0) warnings.push({ field: "totalBudget", message: "Total budget is negative", severity: "warn" });
  if (spent < 0) warnings.push({ field: "spentToDate", message: "Spent to date is negative", severity: "warn" });
  if (spent > budget)
    warnings.push({ field: "spentToDate", message: `Spent (${fmt(spent)}) exceeds total budget (${fmt(budget)})`, severity: "warn" });
  if (pctComplete < 0 || pctComplete > 100)
    warnings.push({ field: "percentComplete", message: "% complete must be between 0 and 100", severity: "warn" });
  if (pctComplete === 100 && status !== "completed")
    warnings.push({ field: "status", message: `100% complete but status is "${status}" — consider marking completed`, severity: "info" });
  if (pctComplete < 50 && status === "on-track" && budget > 0 && spent / budget > 0.75)
    warnings.push({ field: "spentToDate", message: `${pctComplete}% complete but ${pct((spent / budget) * 100)} of budget spent — possible cost overrun`, severity: "warn" });
  if (status === "at-risk" || status === "behind")
    warnings.push({ field: "status", message: `Project flagged as "${status}" — review timeline and budget`, severity: "info" });
  if (!((draft.name ?? row.name) || "").trim())
    warnings.push({ field: "name", message: "Project name cannot be empty", severity: "warn" });
  const start = draft.startDate ?? row.startDate;
  const end = draft.expectedEnd ?? row.expectedEnd;
  if (start && end && new Date(start) > new Date(end))
    warnings.push({ field: "expectedEnd", message: "End date is before start date", severity: "warn" });
  return warnings;
}

// ─── Change tracking ──────────────────────────────────────────────────────────
type ChangeAction = "update" | "delete";
type ChangeType = "revenue" | "department" | "project";

interface PendingChange {
  id: number;
  type: ChangeType;
  action: ChangeAction;
  label: string;        // human-readable row label
  data: Record<string, any>;
  original: Record<string, any>;
  warnings: Warning[];
}

// ─── CSV Export ───────────────────────────────────────────────────────────────
function exportCSV(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Inline cell input ────────────────────────────────────────────────────────
function EditCell({
  value, type = "text", hasWarning, hasError, onCommit, className = "",
}: {
  value: string | number;
  type?: "text" | "number" | "date" | "select";
  options?: string[];
  hasWarning?: boolean;
  hasError?: boolean;
  onCommit: (val: string) => void;
  className?: string;
}) {
  const [local, setLocal] = useState(String(value));

  const base = `w-full px-1.5 py-0.5 rounded text-xs border focus:outline-none focus:ring-1 focus:ring-primary bg-background
    ${hasError ? "border-destructive bg-destructive/5" : hasWarning ? "border-amber-400 bg-amber-50/50 dark:bg-amber-900/10" : "border-transparent hover:border-border focus:border-border"}
    ${className}`;

  return (
    <input
      type={type === "number" ? "number" : type === "date" ? "date" : "text"}
      className={base}
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => onCommit(local)}
      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
    />
  );
}

function SelectCell({
  value, options, hasWarning, onCommit,
}: { value: string; options: string[]; hasWarning?: boolean; onCommit: (v: string) => void }) {
  return (
    <select
      className={`w-full px-1.5 py-0.5 rounded text-xs border bg-background focus:outline-none focus:ring-1 focus:ring-primary
        ${hasWarning ? "border-amber-400 bg-amber-50/50 dark:bg-amber-900/10" : "border-transparent hover:border-border focus:border-border"}`}
      value={value}
      onChange={e => onCommit(e.target.value)}
    >
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// ─── Change Summary Dialog ────────────────────────────────────────────────────
function ChangeSummaryDialog({
  changes,
  onConfirm,
  onCancel,
  isCommitting,
}: {
  changes: PendingChange[];
  onConfirm: () => void;
  onCancel: () => void;
  isCommitting: boolean;
}) {
  const updates = changes.filter(c => c.action === "update");
  const deletes = changes.filter(c => c.action === "delete");
  const warnings = changes.flatMap(c => c.warnings);
  const errorWarnings = warnings.filter(w => w.severity === "warn");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onCancel}>
      <div
        className="bg-background rounded-xl shadow-2xl border w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="text-base font-semibold">Confirm Changes</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {changes.length} change{changes.length !== 1 ? "s" : ""} ready to commit
            </p>
          </div>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* Validation warnings */}
          {errorWarnings.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 text-xs font-semibold">
                <AlertTriangle className="h-3.5 w-3.5" />
                {errorWarnings.length} validation warning{errorWarnings.length !== 1 ? "s" : ""} — review before committing
              </div>
              {errorWarnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-700 dark:text-amber-300 pl-5">{w.message}</p>
              ))}
            </div>
          )}

          {/* Updates */}
          {updates.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Edits ({updates.length})
              </p>
              <div className="space-y-2">
                {updates.map(c => {
                  const changedFields = Object.keys(c.data).filter(k => c.data[k] !== c.original[k]);
                  return (
                    <div key={c.id} className="border rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">{c.type}</Badge>
                        <span className="text-sm font-medium truncate">{c.label}</span>
                        {c.warnings.some(w => w.severity === "warn") && (
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 ml-auto" />
                        )}
                      </div>
                      <div className="space-y-1">
                        {changedFields.map(field => {
                          const from = c.original[field];
                          const to = c.data[field];
                          const isNumeric = typeof from === "number" || typeof to === "number";
                          return (
                            <div key={field} className="flex items-center gap-2 text-xs">
                              <span className="text-muted-foreground w-28 shrink-0 capitalize">
                                {field.replace(/([A-Z])/g, " $1").toLowerCase()}
                              </span>
                              <span className="line-through text-muted-foreground">
                                {isNumeric ? fmt(Number(from)) : String(from ?? "—")}
                              </span>
                              <span className="text-muted-foreground">→</span>
                              <span className="font-medium text-foreground">
                                {isNumeric ? fmt(Number(to)) : String(to ?? "—")}
                              </span>
                              {isNumeric && Number(from) !== 0 && (
                                <span className={`ml-auto text-[10px] font-medium ${Number(to) > Number(from) ? "text-emerald-600" : "text-rose-500"}`}>
                                  {Number(to) > Number(from)
                                    ? <span className="flex items-center gap-0.5"><TrendingUp className="h-3 w-3" />{pct(((Number(to) - Number(from)) / Math.abs(Number(from))) * 100)}</span>
                                    : <span className="flex items-center gap-0.5"><TrendingDown className="h-3 w-3" />{pct(((Number(from) - Number(to)) / Math.abs(Number(from))) * 100)}</span>
                                  }
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Deletes */}
          {deletes.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Deletions ({deletes.length})
              </p>
              <div className="space-y-1.5">
                {deletes.map(c => (
                  <div key={c.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/5 border border-destructive/20">
                    <Trash2 className="h-3.5 w-3.5 text-destructive shrink-0" />
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">{c.type}</Badge>
                    <span className="text-sm font-medium">{c.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 py-4 border-t bg-muted/30">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isCommitting} className="flex-1">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={isCommitting}
            className={`flex-1 ${errorWarnings.length > 0 ? "bg-amber-600 hover:bg-amber-700" : ""}`}
          >
            {isCommitting ? "Saving…" : errorWarnings.length > 0 ? "Commit Anyway" : "Commit Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Row Modal ───────────────────────────────────────────────────────────────

type AddSection = "revenue" | "department" | "project";

/** A labeled form field used inside AddRowModal */
function FormRow({
  label, required, children,
}: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-start gap-3">
      <label className="text-xs text-muted-foreground pt-2 text-right leading-tight">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      <div>{children}</div>
    </div>
  );
}

const fieldCls = `w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs
  focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground`;
const numCls = `${fieldCls} text-right`;

function AddRowModal({
  section,
  year,
  token,
  slug,
  onClose,
  onCreated,
}: {
  section: AddSection;
  year: string;
  token: string | null;
  slug: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  // Revenue fields
  const [rSource, setRSource]   = useState("");
  const [rCat, setRCat]         = useState("Tax Revenue");
  const [rBudget, setRBudget]   = useState("0");
  const [rCollected, setRCollected] = useState("0");

  // Department fields
  const [dDept, setDDept]       = useState("");
  const [dCat, setDCat]         = useState("General Government");
  const [dBudget, setDBudget]   = useState("0");
  const [dSpent, setDSpent]     = useState("0");

  // Project fields
  const today = new Date().toISOString().slice(0, 10);
  const nextYear = `${new Date().getFullYear() + 1}-12-31`;
  const [pName, setPName]           = useState("");
  const [pDept, setPDept]           = useState("");
  const [pBudget, setPBudget]       = useState("0");
  const [pSpent, setPSpent]         = useState("0");
  const [pPct, setPPct]             = useState("0");
  const [pStart, setPStart]         = useState(today);
  const [pEnd, setPEnd]             = useState(nextYear);
  const [pStatus, setPStatus]       = useState("planned");
  const [pDesc, setPDesc]           = useState("");

  const revenueCategories = ["Tax Revenue", "Grants & Aid", "Fees & Permits", "Enterprise Funds", "Other"];
  const deptCategories = ["General Government", "Public Safety", "Public Works", "Parks & Recreation", "Education", "Health & Human Services", "Other"];
  const projectStatuses = ["planned", "on-track", "at-risk", "behind", "completed"];

  const isValid = section === "revenue"
    ? rSource.trim().length > 0
    : section === "department"
    ? dDept.trim().length > 0
    : pName.trim().length > 0 && pDept.trim().length > 0;

  const handleSave = async () => {
    if (!isValid) return;
    setSaving(true);
    try {
      let url = "";
      let body: Record<string, any> = {};
      if (section === "revenue") {
        url = `/api/revenue?tenant=${slug}`;
        body = { source: rSource.trim(), category: rCat, budgetedAmount: parseFloat(rBudget) || 0, collectedAmount: parseFloat(rCollected) || 0, year };
      } else if (section === "department") {
        url = `/api/departments?tenant=${slug}`;
        body = { department: dDept.trim(), category: dCat, budgetedAmount: parseFloat(dBudget) || 0, spentAmount: parseFloat(dSpent) || 0, year };
      } else {
        url = `/api/projects?tenant=${slug}`;
        body = { name: pName.trim(), department: pDept.trim(), totalBudget: parseFloat(pBudget) || 0, spentToDate: parseFloat(pSpent) || 0, percentComplete: parseInt(pPct) || 0, startDate: pStart, expectedEnd: pEnd, status: pStatus, description: pDesc.trim() || null };
      }
      const res = await authFetch(url, token, { method: "POST", body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to create record");
      toast({ title: "Record created", description: "New row added successfully." });
      onCreated();
      onClose();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const title = section === "revenue" ? "Add Revenue Source" : section === "department" ? "Add Department" : "Add Capital Project";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-background rounded-xl shadow-2xl border w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Plus className="h-3.5 w-3.5 text-primary" />
            </div>
            <h2 className="text-sm font-semibold">{title}</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-5 space-y-4">

          {section === "revenue" && (
            <>
              <FormRow label="Source name" required>
                <input className={fieldCls} placeholder="e.g. Property Tax" value={rSource} onChange={e => setRSource(e.target.value)} autoFocus data-testid="input-add-source" />
              </FormRow>
              <FormRow label="Category" required>
                <select className={fieldCls} value={rCat} onChange={e => setRCat(e.target.value)} data-testid="select-add-category">
                  {revenueCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </FormRow>
              <FormRow label="Budgeted amount">
                <input className={numCls} type="number" min="0" placeholder="0" value={rBudget} onChange={e => setRBudget(e.target.value)} data-testid="input-add-budget" />
              </FormRow>
              <FormRow label="Collected amount">
                <input className={numCls} type="number" min="0" placeholder="0" value={rCollected} onChange={e => setRCollected(e.target.value)} data-testid="input-add-collected" />
              </FormRow>
            </>
          )}

          {section === "department" && (
            <>
              <FormRow label="Department name" required>
                <input className={fieldCls} placeholder="e.g. Public Works" value={dDept} onChange={e => setDDept(e.target.value)} autoFocus data-testid="input-add-dept" />
              </FormRow>
              <FormRow label="Category" required>
                <select className={fieldCls} value={dCat} onChange={e => setDCat(e.target.value)} data-testid="select-add-dept-category">
                  {deptCategories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </FormRow>
              <FormRow label="Budgeted amount">
                <input className={numCls} type="number" min="0" placeholder="0" value={dBudget} onChange={e => setDBudget(e.target.value)} data-testid="input-add-dept-budget" />
              </FormRow>
              <FormRow label="Spent amount">
                <input className={numCls} type="number" min="0" placeholder="0" value={dSpent} onChange={e => setDSpent(e.target.value)} data-testid="input-add-dept-spent" />
              </FormRow>
            </>
          )}

          {section === "project" && (
            <>
              <FormRow label="Project name" required>
                <input className={fieldCls} placeholder="e.g. Road Resurfacing" value={pName} onChange={e => setPName(e.target.value)} autoFocus data-testid="input-add-proj-name" />
              </FormRow>
              <FormRow label="Department" required>
                <input className={fieldCls} placeholder="e.g. Public Works" value={pDept} onChange={e => setPDept(e.target.value)} data-testid="input-add-proj-dept" />
              </FormRow>
              <FormRow label="Total budget">
                <input className={numCls} type="number" min="0" placeholder="0" value={pBudget} onChange={e => setPBudget(e.target.value)} data-testid="input-add-proj-budget" />
              </FormRow>
              <FormRow label="Spent to date">
                <input className={numCls} type="number" min="0" placeholder="0" value={pSpent} onChange={e => setPSpent(e.target.value)} data-testid="input-add-proj-spent" />
              </FormRow>
              <FormRow label="% complete">
                <input className={numCls} type="number" min="0" max="100" placeholder="0" value={pPct} onChange={e => setPPct(e.target.value)} data-testid="input-add-proj-pct" />
              </FormRow>
              <FormRow label="Start date">
                <input className={fieldCls} type="date" value={pStart} onChange={e => setPStart(e.target.value)} data-testid="input-add-proj-start" />
              </FormRow>
              <FormRow label="Expected end">
                <input className={fieldCls} type="date" value={pEnd} onChange={e => setPEnd(e.target.value)} data-testid="input-add-proj-end" />
              </FormRow>
              <FormRow label="Status">
                <select className={fieldCls} value={pStatus} onChange={e => setPStatus(e.target.value)} data-testid="select-add-proj-status">
                  {projectStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </FormRow>
              <FormRow label="Description">
                <textarea
                  className={`${fieldCls} h-16 resize-none pt-1.5`}
                  placeholder="Optional project description"
                  value={pDesc}
                  onChange={e => setPDesc(e.target.value)}
                  data-testid="input-add-proj-desc"
                />
              </FormRow>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 py-4 border-t bg-muted/30">
          <Button variant="outline" size="sm" onClick={onClose} className="flex-1" disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!isValid || saving} className="flex-1 gap-1.5" data-testid="btn-add-row-save">
            <Plus className="h-3.5 w-3.5" />
            {saving ? "Saving…" : "Add Record"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Revenue Editor ───────────────────────────────────────────────────────────
function RevenueEditor({ token, slug, year }: { token: string | null; slug: string; year: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: rows = [], isLoading } = useQuery<RevenueSource[]>({
    queryKey: [...tKey(`/api/revenue/${year}`, slug)],
    enabled: !!year,
  });

  // draft: rowId → partial overrides
  const [drafts, setDrafts] = useState<Record<number, Partial<RevenueSource>>>({});
  const [pendingDeletes, setPendingDeletes] = useState<Set<number>>(new Set());
  const [showCommit, setShowCommit] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const setField = useCallback((id: number, field: keyof RevenueSource, value: any) => {
    setDrafts(d => ({ ...d, [id]: { ...d[id], [field]: value } }));
  }, []);

  const toggleDelete = (id: number) => {
    setPendingDeletes(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const changes = useMemo<PendingChange[]>(() => {
    const out: PendingChange[] = [];
    // updates
    for (const [idStr, draft] of Object.entries(drafts)) {
      const id = parseInt(idStr);
      if (pendingDeletes.has(id)) continue;
      const row = rows.find(r => r.id === id);
      if (!row) continue;
      const changed = Object.keys(draft).some(k => (draft as any)[k] !== (row as any)[k]);
      if (!changed) continue;
      const merged = { ...row, ...draft };
      out.push({
        id, type: "revenue", action: "update",
        label: merged.source,
        data: { source: merged.source, category: merged.category, budgetedAmount: merged.budgetedAmount, collectedAmount: merged.collectedAmount },
        original: { source: row.source, category: row.category, budgetedAmount: row.budgetedAmount, collectedAmount: row.collectedAmount },
        warnings: validateRevenue(row, draft),
      });
    }
    // deletes
    for (const id of pendingDeletes) {
      const row = rows.find(r => r.id === id);
      if (!row) continue;
      out.push({ id, type: "revenue", action: "delete", label: row.source, data: {}, original: {}, warnings: [] });
    }
    return out;
  }, [drafts, pendingDeletes, rows]);

  const allWarnings = useMemo(() => rows.flatMap(row => {
    const draft = drafts[row.id] || {};
    return validateRevenue(row, draft).map(w => ({ ...w, rowId: row.id }));
  }), [rows, drafts]);

  const commit = async () => {
    setIsCommitting(true);
    try {
      const res = await authFetch(`/api/bulk-edit?tenant=${slug}`, token, {
        method: "POST",
        body: JSON.stringify({ changes: changes.map(c => ({ type: c.type, id: c.id, action: c.action, data: c.data })) }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Changes saved", description: `${changes.length} change${changes.length !== 1 ? "s" : ""} committed.` });
      setDrafts({}); setPendingDeletes(new Set()); setShowCommit(false);
      qc.invalidateQueries({ queryKey: tKey(`/api/revenue/${year}`, slug) });
      qc.invalidateQueries({ queryKey: tKey("/api/revenue", slug) });
    } catch (e: any) {
      toast({ title: "Commit failed", description: e.message, variant: "destructive" });
    } finally { setIsCommitting(false); }
  };

  const exportData = () => {
    exportCSV(`revenue_${year}_${slug}.csv`,
      ["ID", "Year", "Source", "Category", "Budgeted Amount", "Collected Amount", "Collection Rate"],
      rows.map(r => {
        const d = drafts[r.id] || {};
        const b = d.budgetedAmount ?? r.budgetedAmount;
        const c = d.collectedAmount ?? r.collectedAmount;
        return [String(r.id), year, d.source ?? r.source, d.category ?? r.category, String(b), String(c), b > 0 ? pct((c / b) * 100) : "N/A"];
      })
    );
  };

  const totalBudgeted = rows.reduce((s, r) => s + (drafts[r.id]?.budgetedAmount ?? r.budgetedAmount), 0);
  const totalCollected = rows.reduce((s, r) => s + (drafts[r.id]?.collectedAmount ?? r.collectedAmount), 0);

  if (isLoading) return <div className="py-8 text-center text-sm text-muted-foreground animate-pulse">Loading revenue data…</div>;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 text-xs text-muted-foreground">
          {rows.length} rows · Total budgeted: <span className="font-semibold text-foreground">{fmt(totalBudgeted)}</span>
          · Collected: <span className="font-semibold text-foreground">{fmt(totalCollected)}</span>
          {totalBudgeted > 0 && <span className="ml-1 text-emerald-600 dark:text-emerald-400">({pct((totalCollected / totalBudgeted) * 100)} rate)</span>}
        </div>
        {allWarnings.filter(w => w.severity === "warn").length > 0 && (
          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 gap-1 text-xs">
            <AlertTriangle className="h-3 w-3" />{allWarnings.filter(w => w.severity === "warn").length} warnings
          </Badge>
        )}
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={exportData}>
          <Download className="h-3 w-3" />Export CSV
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-primary border-primary/40 hover:bg-primary/5" onClick={() => setShowAddModal(true)} data-testid="btn-add-revenue">
          <Plus className="h-3 w-3" />Add Row
        </Button>
        {changes.length > 0 && (
          <Button size="sm" className="h-7 text-xs gap-1 bg-primary" onClick={() => setShowCommit(true)}>
            <Save className="h-3 w-3" />Commit {changes.length} change{changes.length !== 1 ? "s" : ""}
          </Button>
        )}
      </div>

      {/* Empty state with add prompt */}
      {!rows.length && (
        <div className="py-10 flex flex-col items-center gap-3 text-center border rounded-lg bg-muted/20">
          <p className="text-sm text-muted-foreground">No revenue data for {year}.</p>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowAddModal(true)}>
            <Plus className="h-3.5 w-3.5" />Add your first revenue source
          </Button>
        </div>
      )}
      {!rows.length && null /* skip table render below */}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-muted/70">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground w-[30%]">Source</th>
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground w-[18%]">Category</th>
              <th className="px-3 py-2 text-right font-semibold text-muted-foreground w-[18%]">Budgeted</th>
              <th className="px-3 py-2 text-right font-semibold text-muted-foreground w-[18%]">Collected</th>
              <th className="px-3 py-2 text-right font-semibold text-muted-foreground w-[10%]">Rate</th>
              <th className="px-2 py-2 w-[6%]"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const d = drafts[row.id] || {};
              const isDirty = Object.keys(d).some(k => (d as any)[k] !== (row as any)[k]);
              const isDeleting = pendingDeletes.has(row.id);
              const rowWarnings = validateRevenue(row, d);
              const hasWarn = rowWarnings.some(w => w.severity === "warn");
              const hasInfo = rowWarnings.some(w => w.severity === "info");

              const budgeted = d.budgetedAmount ?? row.budgetedAmount;
              const collected = d.collectedAmount ?? row.collectedAmount;
              const rate = budgeted > 0 ? (collected / budgeted) * 100 : 0;

              return (
                <tr
                  key={row.id}
                  className={`border-t transition-colors
                    ${isDeleting ? "bg-destructive/5 opacity-50" : isDirty ? "bg-primary/5" : i % 2 === 0 ? "" : "bg-muted/20"}
                    ${!isDeleting ? "hover:bg-muted/40" : ""}`}
                >
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      {(isDirty || isDeleting) && <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" title="Unsaved changes" />}
                      {hasWarn && !isDeleting && <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />}
                      {hasInfo && !hasWarn && !isDeleting && <Info className="h-3 w-3 text-blue-400 shrink-0" />}
                      <EditCell
                        value={d.source ?? row.source}
                        hasWarning={rowWarnings.some(w => w.field === "source" && w.severity === "warn")}
                        onCommit={v => setField(row.id, "source", v)}
                      />
                    </div>
                    {rowWarnings.map((w, wi) => (
                      <p key={wi} className={`text-[10px] mt-0.5 pl-5 ${w.severity === "warn" ? "text-amber-600 dark:text-amber-400" : "text-blue-500"}`}>
                        {w.message}
                      </p>
                    ))}
                  </td>
                  <td className="px-2 py-1.5">
                    <EditCell value={d.category ?? row.category} onCommit={v => setField(row.id, "category", v)} />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <EditCell
                      value={budgeted}
                      type="number"
                      hasWarning={rowWarnings.some(w => w.field === "budgetedAmount" && w.severity === "warn")}
                      onCommit={v => setField(row.id, "budgetedAmount", parseFloat(v) || 0)}
                      className="text-right"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <EditCell
                      value={collected}
                      type="number"
                      hasWarning={rowWarnings.some(w => w.field === "collectedAmount" && w.severity === "warn")}
                      onCommit={v => setField(row.id, "collectedAmount", parseFloat(v) || 0)}
                      className="text-right"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <span className={`text-xs font-medium ${rate >= 100 ? "text-emerald-600 dark:text-emerald-400" : rate >= 85 ? "text-foreground" : "text-amber-600 dark:text-amber-400"}`}>
                      {budgeted > 0 ? pct(rate) : "—"}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      onClick={() => toggleDelete(row.id)}
                      className={`p-1 rounded hover:bg-muted transition-colors ${isDeleting ? "text-destructive" : "text-muted-foreground hover:text-destructive"}`}
                      title={isDeleting ? "Undo delete" : "Delete row"}
                    >
                      {isDeleting ? <X className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-muted/50 border-t-2">
            <tr>
              <td colSpan={2} className="px-3 py-2 text-xs font-semibold">Total</td>
              <td className="px-3 py-2 text-right text-xs font-semibold">{fmt(totalBudgeted)}</td>
              <td className="px-3 py-2 text-right text-xs font-semibold">{fmt(totalCollected)}</td>
              <td className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">
                {totalBudgeted > 0 ? pct((totalCollected / totalBudgeted) * 100) : "—"}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {showCommit && (
        <ChangeSummaryDialog
          changes={changes}
          onConfirm={commit}
          onCancel={() => setShowCommit(false)}
          isCommitting={isCommitting}
        />
      )}
      {showAddModal && (
        <AddRowModal
          section="revenue"
          year={year}
          token={token}
          slug={slug}
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: tKey(`/api/revenue/${year}`, slug) });
            qc.invalidateQueries({ queryKey: tKey("/api/revenue", slug) });
          }}
        />
      )}
    </div>
  );
}

// ─── Department Editor ────────────────────────────────────────────────────────
function DepartmentEditor({ token, slug, year }: { token: string | null; slug: string; year: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: rows = [], isLoading } = useQuery<DepartmentBudget[]>({
    queryKey: [...tKey(`/api/departments/${year}`, slug)],
    enabled: !!year,
  });

  const [drafts, setDrafts] = useState<Record<number, Partial<DepartmentBudget>>>({});
  const [pendingDeletes, setPendingDeletes] = useState<Set<number>>(new Set());
  const [showCommit, setShowCommit] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const setField = useCallback((id: number, field: keyof DepartmentBudget, value: any) => {
    setDrafts(d => ({ ...d, [id]: { ...d[id], [field]: value } }));
  }, []);

  const toggleDelete = (id: number) => {
    setPendingDeletes(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const changes = useMemo<PendingChange[]>(() => {
    const out: PendingChange[] = [];
    for (const [idStr, draft] of Object.entries(drafts)) {
      const id = parseInt(idStr);
      if (pendingDeletes.has(id)) continue;
      const row = rows.find(r => r.id === id);
      if (!row) continue;
      const changed = Object.keys(draft).some(k => (draft as any)[k] !== (row as any)[k]);
      if (!changed) continue;
      const merged = { ...row, ...draft };
      out.push({
        id, type: "department", action: "update",
        label: merged.department,
        data: { department: merged.department, category: merged.category, budgetedAmount: merged.budgetedAmount, spentAmount: merged.spentAmount },
        original: { department: row.department, category: row.category, budgetedAmount: row.budgetedAmount, spentAmount: row.spentAmount },
        warnings: validateDepartment(row, draft),
      });
    }
    for (const id of pendingDeletes) {
      const row = rows.find(r => r.id === id);
      if (!row) continue;
      out.push({ id, type: "department", action: "delete", label: row.department, data: {}, original: {}, warnings: [] });
    }
    return out;
  }, [drafts, pendingDeletes, rows]);

  const allWarnings = useMemo(() => rows.flatMap(row => {
    const draft = drafts[row.id] || {};
    return validateDepartment(row, draft).map(w => ({ ...w, rowId: row.id }));
  }), [rows, drafts]);

  const commit = async () => {
    setIsCommitting(true);
    try {
      const res = await authFetch(`/api/bulk-edit?tenant=${slug}`, token, {
        method: "POST",
        body: JSON.stringify({ changes: changes.map(c => ({ type: c.type, id: c.id, action: c.action, data: c.data })) }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Changes saved", description: `${changes.length} change${changes.length !== 1 ? "s" : ""} committed.` });
      setDrafts({}); setPendingDeletes(new Set()); setShowCommit(false);
      qc.invalidateQueries({ queryKey: tKey(`/api/departments/${year}`, slug) });
      qc.invalidateQueries({ queryKey: tKey("/api/departments", slug) });
    } catch (e: any) {
      toast({ title: "Commit failed", description: e.message, variant: "destructive" });
    } finally { setIsCommitting(false); }
  };

  const exportData = () => {
    exportCSV(`departments_${year}_${slug}.csv`,
      ["ID", "Year", "Department", "Category", "Budgeted Amount", "Spent Amount", "% Spent", "Remaining"],
      rows.map(r => {
        const d = drafts[r.id] || {};
        const b = d.budgetedAmount ?? r.budgetedAmount;
        const s = d.spentAmount ?? r.spentAmount;
        return [String(r.id), year, d.department ?? r.department, d.category ?? r.category,
          String(b), String(s), b > 0 ? pct((s / b) * 100) : "N/A", String(b - s)];
      })
    );
  };

  const totalBudgeted = rows.reduce((s, r) => s + (drafts[r.id]?.budgetedAmount ?? r.budgetedAmount), 0);
  const totalSpent = rows.reduce((s, r) => s + (drafts[r.id]?.spentAmount ?? r.spentAmount), 0);

  if (isLoading) return <div className="py-8 text-center text-sm text-muted-foreground animate-pulse">Loading department data…</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 text-xs text-muted-foreground">
          {rows.length} rows · Total budget: <span className="font-semibold text-foreground">{fmt(totalBudgeted)}</span>
          · Spent: <span className="font-semibold text-foreground">{fmt(totalSpent)}</span>
          {totalBudgeted > 0 && (
            <span className={`ml-1 ${totalSpent > totalBudgeted ? "text-rose-500" : "text-muted-foreground"}`}>
              ({pct((totalSpent / totalBudgeted) * 100)} of budget)
            </span>
          )}
        </div>
        {allWarnings.filter(w => w.severity === "warn").length > 0 && (
          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 gap-1 text-xs">
            <AlertTriangle className="h-3 w-3" />{allWarnings.filter(w => w.severity === "warn").length} warnings
          </Badge>
        )}
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={exportData}>
          <Download className="h-3 w-3" />Export CSV
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-primary border-primary/40 hover:bg-primary/5" onClick={() => setShowAddModal(true)} data-testid="btn-add-department">
          <Plus className="h-3 w-3" />Add Row
        </Button>
        {changes.length > 0 && (
          <Button size="sm" className="h-7 text-xs gap-1" onClick={() => setShowCommit(true)}>
            <Save className="h-3 w-3" />Commit {changes.length} change{changes.length !== 1 ? "s" : ""}
          </Button>
        )}
      </div>

      {/* Empty state */}
      {!rows.length && (
        <div className="py-10 flex flex-col items-center gap-3 text-center border rounded-lg bg-muted/20">
          <p className="text-sm text-muted-foreground">No department data for {year}.</p>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowAddModal(true)}>
            <Plus className="h-3.5 w-3.5" />Add your first department
          </Button>
        </div>
      )}
      {!rows.length && null /* skip table */}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-muted/70">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground w-[28%]">Department</th>
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground w-[18%]">Category</th>
              <th className="px-3 py-2 text-right font-semibold text-muted-foreground w-[18%]">Budgeted</th>
              <th className="px-3 py-2 text-right font-semibold text-muted-foreground w-[18%]">Spent / Actual</th>
              <th className="px-3 py-2 text-right font-semibold text-muted-foreground w-[12%]">Remaining</th>
              <th className="px-2 py-2 w-[6%]"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const d = drafts[row.id] || {};
              const isDirty = Object.keys(d).some(k => (d as any)[k] !== (row as any)[k]);
              const isDeleting = pendingDeletes.has(row.id);
              const rowWarnings = validateDepartment(row, d);
              const hasWarn = rowWarnings.some(w => w.severity === "warn");
              const hasInfo = rowWarnings.some(w => w.severity === "info");

              const budgeted = d.budgetedAmount ?? row.budgetedAmount;
              const spent = d.spentAmount ?? row.spentAmount;
              const remaining = budgeted - spent;
              const overBudget = spent > budgeted;

              return (
                <tr
                  key={row.id}
                  className={`border-t transition-colors
                    ${isDeleting ? "bg-destructive/5 opacity-50" : isDirty ? "bg-primary/5" : i % 2 === 0 ? "" : "bg-muted/20"}
                    ${!isDeleting ? "hover:bg-muted/40" : ""}`}
                >
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      {(isDirty || isDeleting) && <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                      {hasWarn && !isDeleting && <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />}
                      {hasInfo && !hasWarn && !isDeleting && <Info className="h-3 w-3 text-blue-400 shrink-0" />}
                      <EditCell
                        value={d.department ?? row.department}
                        hasWarning={rowWarnings.some(w => w.field === "department" && w.severity === "warn")}
                        onCommit={v => setField(row.id, "department", v)}
                      />
                    </div>
                    {rowWarnings.map((w, wi) => (
                      <p key={wi} className={`text-[10px] mt-0.5 pl-5 ${w.severity === "warn" ? "text-amber-600 dark:text-amber-400" : "text-blue-500"}`}>
                        {w.message}
                      </p>
                    ))}
                  </td>
                  <td className="px-2 py-1.5">
                    <EditCell value={d.category ?? row.category} onCommit={v => setField(row.id, "category", v)} />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <EditCell
                      value={budgeted}
                      type="number"
                      hasWarning={rowWarnings.some(w => w.field === "budgetedAmount" && w.severity === "warn")}
                      onCommit={v => setField(row.id, "budgetedAmount", parseFloat(v) || 0)}
                      className="text-right"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <EditCell
                      value={spent}
                      type="number"
                      hasWarning={rowWarnings.some(w => w.field === "spentAmount" && w.severity === "warn")}
                      onCommit={v => setField(row.id, "spentAmount", parseFloat(v) || 0)}
                      className="text-right"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <span className={`font-medium ${overBudget ? "text-rose-500" : remaining < budgeted * 0.1 ? "text-amber-500" : "text-emerald-600 dark:text-emerald-400"}`}>
                      {overBudget ? `-${fmt(Math.abs(remaining))}` : fmt(remaining)}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      onClick={() => toggleDelete(row.id)}
                      className={`p-1 rounded hover:bg-muted transition-colors ${isDeleting ? "text-destructive" : "text-muted-foreground hover:text-destructive"}`}
                    >
                      {isDeleting ? <X className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-muted/50 border-t-2">
            <tr>
              <td colSpan={2} className="px-3 py-2 text-xs font-semibold">Total</td>
              <td className="px-3 py-2 text-right text-xs font-semibold">{fmt(totalBudgeted)}</td>
              <td className="px-3 py-2 text-right text-xs font-semibold">{fmt(totalSpent)}</td>
              <td className={`px-3 py-2 text-right text-xs font-semibold ${totalSpent > totalBudgeted ? "text-rose-500" : "text-emerald-600 dark:text-emerald-400"}`}>
                {totalSpent > totalBudgeted ? `-${fmt(Math.abs(totalBudgeted - totalSpent))}` : fmt(totalBudgeted - totalSpent)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {showCommit && (
        <ChangeSummaryDialog
          changes={changes}
          onConfirm={commit}
          onCancel={() => setShowCommit(false)}
          isCommitting={isCommitting}
        />
      )}
      {showAddModal && (
        <AddRowModal
          section="department"
          year={year}
          token={token}
          slug={slug}
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: tKey(`/api/departments/${year}`, slug) });
            qc.invalidateQueries({ queryKey: tKey("/api/departments", slug) });
          }}
        />
      )}
    </div>
  );
}

// ─── Projects Editor ──────────────────────────────────────────────────────────
function ProjectsEditor({ token, slug }: { token: string | null; slug: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: rows = [], isLoading } = useQuery<CapitalProject[]>({
    queryKey: tKey("/api/projects", slug),
  });

  const [drafts, setDrafts] = useState<Record<number, Partial<CapitalProject>>>({});
  const [pendingDeletes, setPendingDeletes] = useState<Set<number>>(new Set());
  const [showCommit, setShowCommit] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const setField = useCallback((id: number, field: keyof CapitalProject, value: any) => {
    setDrafts(d => ({ ...d, [id]: { ...d[id], [field]: value } }));
  }, []);

  const toggleDelete = (id: number) => {
    setPendingDeletes(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const changes = useMemo<PendingChange[]>(() => {
    const out: PendingChange[] = [];
    for (const [idStr, draft] of Object.entries(drafts)) {
      const id = parseInt(idStr);
      if (pendingDeletes.has(id)) continue;
      const row = rows.find(r => r.id === id);
      if (!row) continue;
      const changed = Object.keys(draft).some(k => (draft as any)[k] !== (row as any)[k]);
      if (!changed) continue;
      const merged = { ...row, ...draft };
      out.push({
        id, type: "project", action: "update",
        label: merged.name,
        data: { name: merged.name, department: merged.department, totalBudget: merged.totalBudget, spentToDate: merged.spentToDate, percentComplete: merged.percentComplete, status: merged.status, startDate: merged.startDate, expectedEnd: merged.expectedEnd, description: merged.description },
        original: { name: row.name, department: row.department, totalBudget: row.totalBudget, spentToDate: row.spentToDate, percentComplete: row.percentComplete, status: row.status, startDate: row.startDate, expectedEnd: row.expectedEnd, description: row.description },
        warnings: validateProject(row, draft),
      });
    }
    for (const id of pendingDeletes) {
      const row = rows.find(r => r.id === id);
      if (!row) continue;
      out.push({ id, type: "project", action: "delete", label: row.name, data: {}, original: {}, warnings: [] });
    }
    return out;
  }, [drafts, pendingDeletes, rows]);

  const allWarnings = useMemo(() => rows.flatMap(row => {
    const draft = drafts[row.id] || {};
    return validateProject(row, draft).map(w => ({ ...w, rowId: row.id }));
  }), [rows, drafts]);

  const commit = async () => {
    setIsCommitting(true);
    try {
      const res = await authFetch(`/api/bulk-edit?tenant=${slug}`, token, {
        method: "POST",
        body: JSON.stringify({ changes: changes.map(c => ({ type: c.type, id: c.id, action: c.action, data: c.data })) }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Changes saved", description: `${changes.length} change${changes.length !== 1 ? "s" : ""} committed.` });
      setDrafts({}); setPendingDeletes(new Set()); setShowCommit(false);
      qc.invalidateQueries({ queryKey: tKey("/api/projects", slug) });
    } catch (e: any) {
      toast({ title: "Commit failed", description: e.message, variant: "destructive" });
    } finally { setIsCommitting(false); }
  };

  const exportData = () => {
    exportCSV(`projects_${slug}.csv`,
      ["ID", "Name", "Department", "Total Budget", "Spent To Date", "% Complete", "Status", "Start Date", "Expected End", "Description"],
      rows.map(r => {
        const d = drafts[r.id] || {};
        return [String(r.id), d.name ?? r.name, d.department ?? r.department,
          String(d.totalBudget ?? r.totalBudget), String(d.spentToDate ?? r.spentToDate),
          String(d.percentComplete ?? r.percentComplete), d.status ?? r.status,
          d.startDate ?? r.startDate, d.expectedEnd ?? r.expectedEnd,
          d.description ?? r.description ?? ""];
      })
    );
  };

  const statusColors: Record<string, string> = {
    "on-track": "text-emerald-600 dark:text-emerald-400",
    "at-risk": "text-amber-600 dark:text-amber-400",
    "behind": "text-rose-500",
    "completed": "text-blue-500",
    "planned": "text-muted-foreground",
  };

  if (isLoading) return <div className="py-8 text-center text-sm text-muted-foreground animate-pulse">Loading projects…</div>;

  const totalBudget = rows.reduce((s, r) => s + (drafts[r.id]?.totalBudget ?? r.totalBudget), 0);
  const totalSpent = rows.reduce((s, r) => s + (drafts[r.id]?.spentToDate ?? r.spentToDate), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 text-xs text-muted-foreground">
          {rows.length} projects · Total capital budget: <span className="font-semibold text-foreground">{fmt(totalBudget)}</span>
          · Spent: <span className="font-semibold text-foreground">{fmt(totalSpent)}</span>
        </div>
        {allWarnings.filter(w => w.severity === "warn").length > 0 && (
          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 gap-1 text-xs">
            <AlertTriangle className="h-3 w-3" />{allWarnings.filter(w => w.severity === "warn").length} warnings
          </Badge>
        )}
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={exportData}>
          <Download className="h-3 w-3" />Export CSV
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-primary border-primary/40 hover:bg-primary/5" onClick={() => setShowAddModal(true)} data-testid="btn-add-project">
          <Plus className="h-3 w-3" />Add Row
        </Button>
        {changes.length > 0 && (
          <Button size="sm" className="h-7 text-xs gap-1" onClick={() => setShowCommit(true)}>
            <Save className="h-3 w-3" />Commit {changes.length} change{changes.length !== 1 ? "s" : ""}
          </Button>
        )}
      </div>

      {/* Empty state */}
      {!rows.length && (
        <div className="py-10 flex flex-col items-center gap-3 text-center border rounded-lg bg-muted/20">
          <p className="text-sm text-muted-foreground">No capital projects yet.</p>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowAddModal(true)}>
            <Plus className="h-3.5 w-3.5" />Add your first project
          </Button>
        </div>
      )}
      {!rows.length && null /* skip table */}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-muted/70">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground w-[25%]">Project</th>
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground w-[16%]">Department</th>
              <th className="px-3 py-2 text-right font-semibold text-muted-foreground w-[13%]">Total Budget</th>
              <th className="px-3 py-2 text-right font-semibold text-muted-foreground w-[13%]">Spent</th>
              <th className="px-3 py-2 text-center font-semibold text-muted-foreground w-[9%]">% Done</th>
              <th className="px-3 py-2 text-center font-semibold text-muted-foreground w-[12%]">Status</th>
              <th className="px-3 py-2 text-left font-semibold text-muted-foreground w-[8%]">End Date</th>
              <th className="px-2 py-2 w-[4%]"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const d = drafts[row.id] || {};
              const isDirty = Object.keys(d).some(k => (d as any)[k] !== (row as any)[k]);
              const isDeleting = pendingDeletes.has(row.id);
              const rowWarnings = validateProject(row, d);
              const hasWarn = rowWarnings.some(w => w.severity === "warn");
              const hasInfo = rowWarnings.some(w => w.severity === "info");
              const status = d.status ?? row.status;

              return (
                <tr
                  key={row.id}
                  className={`border-t transition-colors
                    ${isDeleting ? "bg-destructive/5 opacity-50" : isDirty ? "bg-primary/5" : i % 2 === 0 ? "" : "bg-muted/20"}
                    ${!isDeleting ? "hover:bg-muted/40" : ""}`}
                >
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      {(isDirty || isDeleting) && <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
                      {hasWarn && !isDeleting && <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />}
                      {hasInfo && !hasWarn && !isDeleting && <Info className="h-3 w-3 text-blue-400 shrink-0" />}
                      <EditCell
                        value={d.name ?? row.name}
                        hasWarning={rowWarnings.some(w => w.field === "name" && w.severity === "warn")}
                        onCommit={v => setField(row.id, "name", v)}
                      />
                    </div>
                    {rowWarnings.map((w, wi) => (
                      <p key={wi} className={`text-[10px] mt-0.5 pl-5 ${w.severity === "warn" ? "text-amber-600 dark:text-amber-400" : "text-blue-500"}`}>
                        {w.message}
                      </p>
                    ))}
                  </td>
                  <td className="px-2 py-1.5">
                    <EditCell value={d.department ?? row.department} onCommit={v => setField(row.id, "department", v)} />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <EditCell
                      value={d.totalBudget ?? row.totalBudget}
                      type="number"
                      hasWarning={rowWarnings.some(w => w.field === "totalBudget" && w.severity === "warn")}
                      onCommit={v => setField(row.id, "totalBudget", parseFloat(v) || 0)}
                      className="text-right"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <EditCell
                      value={d.spentToDate ?? row.spentToDate}
                      type="number"
                      hasWarning={rowWarnings.some(w => w.field === "spentToDate" && w.severity === "warn")}
                      onCommit={v => setField(row.id, "spentToDate", parseFloat(v) || 0)}
                      className="text-right"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <EditCell
                      value={d.percentComplete ?? row.percentComplete}
                      type="number"
                      hasWarning={rowWarnings.some(w => w.field === "percentComplete" && w.severity === "warn")}
                      onCommit={v => setField(row.id, "percentComplete", Math.min(100, Math.max(0, parseInt(v) || 0)))}
                      className="text-center"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <SelectCell
                      value={status}
                      options={["planned", "on-track", "at-risk", "behind", "completed"]}
                      hasWarning={rowWarnings.some(w => w.field === "status" && w.severity === "warn")}
                      onCommit={v => setField(row.id, "status", v)}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <EditCell
                      value={d.expectedEnd ?? row.expectedEnd}
                      type="date"
                      hasWarning={rowWarnings.some(w => w.field === "expectedEnd" && w.severity === "warn")}
                      onCommit={v => setField(row.id, "expectedEnd", v)}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button
                      onClick={() => toggleDelete(row.id)}
                      className={`p-1 rounded hover:bg-muted transition-colors ${isDeleting ? "text-destructive" : "text-muted-foreground hover:text-destructive"}`}
                    >
                      {isDeleting ? <X className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-muted/50 border-t-2">
            <tr>
              <td colSpan={2} className="px-3 py-2 text-xs font-semibold">Total ({rows.length} projects)</td>
              <td className="px-3 py-2 text-right text-xs font-semibold">{fmt(totalBudget)}</td>
              <td className="px-3 py-2 text-right text-xs font-semibold">{fmt(totalSpent)}</td>
              <td colSpan={4} />
            </tr>
          </tfoot>
        </table>
      </div>

      {showCommit && (
        <ChangeSummaryDialog
          changes={changes}
          onConfirm={commit}
          onCancel={() => setShowCommit(false)}
          isCommitting={isCommitting}
        />
      )}
      {showAddModal && (
        <AddRowModal
          section="project"
          year=""
          token={token}
          slug={slug}
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: tKey("/api/projects", slug) });
          }}
        />
      )}
    </div>
  );
}

// ─── Main DataEditor shell ────────────────────────────────────────────────────
type EditorSection = "revenue" | "departments" | "projects";

export function DataEditor({ token, slug }: { token: string | null; slug: string }) {
  const [activeSection, setActiveSection] = useState<EditorSection>("revenue");
  const [open, setOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState<string>("");

  const { data: years = [] } = useQuery<string[]>({
    queryKey: tKey("/api/years", slug),
  });

  // Auto-select the most recent year when years load
  const effectiveYear = selectedYear || years[0] || "";

  const sections: { key: EditorSection; label: string }[] = [
    { key: "revenue", label: "Revenue" },
    { key: "departments", label: "Spending" },
    { key: "projects", label: "Capital Projects" },
  ];

  return (
    <div className="border rounded-xl overflow-hidden">
      {/* Header — clickable to expand */}
      <button
        className="w-full flex items-center justify-between px-5 py-4 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
        onClick={() => setOpen(o => !o)}
        data-testid="btn-toggle-data-editor"
      >
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Edit3 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">Data Editor</p>
            <p className="text-xs text-muted-foreground">View and edit budget data inline — with validation checks and CSV export</p>
          </div>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="p-5 space-y-4 border-t">
          {/* Section tabs + year picker */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
              {sections.map(s => (
                <button
                  key={s.key}
                  onClick={() => setActiveSection(s.key)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors
                    ${activeSection === s.key ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  data-testid={`btn-editor-section-${s.key}`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {activeSection !== "projects" && years.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Year:</span>
                <select
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={effectiveYear}
                  onChange={e => setSelectedYear(e.target.value)}
                  data-testid="select-editor-year"
                >
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            )}

            {/* Legend */}
            <div className="ml-auto flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-primary" />Unsaved edit</span>
              <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-500" />Validation warning</span>
              <span className="flex items-center gap-1"><Info className="h-3 w-3 text-blue-400" />Info notice</span>
            </div>
          </div>

          {/* Editor body */}
          {activeSection === "revenue" && effectiveYear && (
            <RevenueEditor token={token} slug={slug} year={effectiveYear} />
          )}
          {activeSection === "departments" && effectiveYear && (
            <DepartmentEditor token={token} slug={slug} year={effectiveYear} />
          )}
          {activeSection === "projects" && (
            <ProjectsEditor token={token} slug={slug} />
          )}
        </div>
      )}
    </div>
  );
}
