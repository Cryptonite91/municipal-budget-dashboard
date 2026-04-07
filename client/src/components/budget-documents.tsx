/**
 * Budget Documents
 *
 * Admin view: upload PDFs/files, set display name, year tag, per-file public toggle, delete.
 * Public view: clean card list of publicly shared documents with download links.
 */

import { useState, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { tKey } from "@/hooks/use-budget-data";
import { API_BASE } from "@/lib/api-base";
import type { BudgetDocument } from "@shared/schema";
import {
  FileText, Upload, Trash2, Eye, EyeOff, Download, FilePlus,
  X, CheckCircle2, AlertTriangle, FileImage, FileSpreadsheet,
  ChevronDown, ChevronUp, ExternalLink, Loader2,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fileIcon(mimeType: string) {
  if (mimeType.includes("pdf")) return <FileText className="h-4 w-4 text-rose-500" />;
  if (mimeType.includes("image")) return <FileImage className="h-4 w-4 text-violet-500" />;
  if (mimeType.includes("sheet") || mimeType.includes("excel") || mimeType.includes("csv"))
    return <FileSpreadsheet className="h-4 w-4 text-emerald-600" />;
  return <FileText className="h-4 w-4 text-muted-foreground" />;
}

// Build the document download URL — routes through Railway backend
function docUrl(muniId: number, filename: string, token?: string | null): string {
  const base = `${API_BASE}/uploads/${muniId}/${filename}`;
  return token ? `${base}?token=${token}` : base;
}

// ─── Upload Drop Zone ──────────────────────────────────────────────────────────

type UploadStep = "idle" | "form" | "uploading";

interface UploadState {
  file: File | null;
  base64: string | null;
  displayName: string;
  description: string;
  year: string;
  step: UploadStep;
  progress: number;
}

function UploadZone({
  token, slug, muniId, years,
  onUploaded,
}: {
  token: string | null;
  slug: string;
  muniId: number;
  years: string[];
  onUploaded: () => void;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({
    file: null, base64: null, displayName: "", description: "", year: years[0] || "",
    step: "idle", progress: 0,
  });
  const [dragging, setDragging] = useState(false);

  const acceptFile = useCallback(async (file: File) => {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    setState(s => ({
      ...s, file, base64,
      displayName: file.name,
      year: years[0] || "",
      description: "",
      step: "form",
      progress: 0,
    }));
  }, [years]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) acceptFile(file);
  }, [acceptFile]);

  const handleUpload = async () => {
    if (!state.file || !state.base64) return;
    setState(s => ({ ...s, step: "uploading", progress: 20 }));
    try {
      setState(s => ({ ...s, progress: 50 }));
      const res = await authFetch(`/api/documents?tenant=${slug}`, token, {
        method: "POST",
        body: JSON.stringify({
          data: state.base64,
          originalName: state.displayName.trim() || state.file!.name,
          mimeType: state.file!.type || "application/octet-stream",
          description: state.description.trim() || null,
          year: state.year || null,
        }),
      });
      setState(s => ({ ...s, progress: 90 }));
      if (!res.ok) throw new Error((await res.json()).error || "Upload failed");
      toast({ title: "Document uploaded", description: `${state.displayName || state.file!.name} was added successfully.` });
      setState({ file: null, base64: null, displayName: "", description: "", year: years[0] || "", step: "idle", progress: 0 });
      onUploaded();
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
      setState(s => ({ ...s, step: "form", progress: 0 }));
    }
  };

  const clear = () => setState(s => ({ ...s, file: null, base64: null, displayName: "", description: "", step: "idle", progress: 0 }));

  const fieldCls = "w-full h-8 rounded-md border border-input bg-background px-2.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground";

  // ── Form (file selected) ──────────────────────────────────────────────────
  if (state.step === "form" || state.step === "uploading") {
    return (
      <div className="border rounded-xl p-4 space-y-3 bg-muted/20">
        {/* File header */}
        <div className="flex items-center gap-2">
          {fileIcon(state.file!.type)}
          <span className="text-xs font-medium flex-1 truncate">{state.file!.name}</span>
          <span className="text-[10px] text-muted-foreground shrink-0">{formatBytes(state.file!.size)}</span>
          {state.step === "form" && (
            <button onClick={clear} className="text-muted-foreground hover:text-foreground ml-1">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Progress bar */}
        {state.step === "uploading" && (
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${state.progress}%` }} />
          </div>
        )}

        {/* Metadata fields */}
        {state.step === "form" && (
          <>
            <div className="grid grid-cols-1 gap-2.5">
              <div className="grid grid-cols-[100px_1fr] items-center gap-2">
                <label className="text-xs text-muted-foreground text-right">Display name</label>
                <input
                  className={fieldCls}
                  value={state.displayName}
                  onChange={e => setState(s => ({ ...s, displayName: e.target.value }))}
                  placeholder="e.g. 2025 General Fund Budget"
                  data-testid="input-doc-name"
                />
              </div>
              <div className="grid grid-cols-[100px_1fr] items-center gap-2">
                <label className="text-xs text-muted-foreground text-right">Year</label>
                <select
                  className={fieldCls}
                  value={state.year}
                  onChange={e => setState(s => ({ ...s, year: e.target.value }))}
                  data-testid="select-doc-year"
                >
                  <option value="">No year tag</option>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-[100px_1fr] items-start gap-2">
                <label className="text-xs text-muted-foreground text-right pt-2">Description</label>
                <textarea
                  className={`${fieldCls} h-14 resize-none pt-1.5`}
                  value={state.description}
                  onChange={e => setState(s => ({ ...s, description: e.target.value }))}
                  placeholder="Optional note for citizens"
                  data-testid="input-doc-desc"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={clear} className="flex-1 text-xs h-8">Cancel</Button>
              <Button size="sm" onClick={handleUpload} className="flex-1 text-xs h-8 gap-1.5" data-testid="btn-upload-doc">
                <Upload className="h-3.5 w-3.5" />
                Upload Document
              </Button>
            </div>
          </>
        )}

        {state.step === "uploading" && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Uploading… {state.progress}%
          </div>
        )}
      </div>
    );
  }

  // ── Drop zone (idle) ──────────────────────────────────────────────────────
  return (
    <div
      className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer
        ${dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"}`}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => fileInputRef.current?.click()}
      data-testid="dropzone-doc"
    >
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.txt"
        onChange={e => { const f = e.target.files?.[0]; if (f) acceptFile(f); }}
      />
      <FilePlus className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
      <p className="text-sm font-medium text-muted-foreground">Drop a file or click to browse</p>
      <p className="text-xs text-muted-foreground/70 mt-1">PDF, Word, Excel, CSV, Images — up to 50 MB</p>
    </div>
  );
}

// ─── Admin Document Row ───────────────────────────────────────────────────────

function AdminDocRow({
  doc, token, slug, muniId, onRefresh,
}: {
  doc: BudgetDocument;
  token: string | null;
  slug: string;
  muniId: number;
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const toggleVisibility = async () => {
    setToggling(true);
    try {
      const res = await authFetch(`/api/documents/${doc.id}/visibility?tenant=${slug}`, token, {
        method: "PATCH",
        body: JSON.stringify({ isPublic: !doc.isPublic }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      onRefresh();
      toast({
        title: doc.isPublic ? "Document hidden" : "Document made public",
        description: doc.isPublic
          ? "Citizens will no longer see this document."
          : "Citizens can now download this document.",
      });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setToggling(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await authFetch(`/api/documents/${doc.id}?tenant=${slug}`, token, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      onRefresh();
      toast({ title: "Document deleted", description: `${doc.originalName} was removed.` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setDeleting(false);
    }
  };

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${deleting ? "opacity-50" : "hover:bg-muted/30"}`}>
      <div className="shrink-0">{fileIcon(doc.mimeType)}</div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium truncate">{doc.originalName}</span>
          {doc.year && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">{doc.year}</Badge>
          )}
          {doc.isPublic
            ? <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shrink-0">Public</Badge>
            : <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground shrink-0">Private</Badge>
          }
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-muted-foreground">{formatBytes(doc.size)}</span>
          <span className="text-[10px] text-muted-foreground">·</span>
          <span className="text-[10px] text-muted-foreground">{formatDate(doc.uploadedAt)}</span>
          {doc.description && (
            <>
              <span className="text-[10px] text-muted-foreground">·</span>
              <span className="text-[10px] text-muted-foreground truncate max-w-[160px]">{doc.description}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {/* Preview */}
        <a
          href={docUrl(muniId, doc.filename, token)}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          title="Preview"
          data-testid={`btn-preview-doc-${doc.id}`}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>

        {/* Visibility toggle */}
        <button
          onClick={toggleVisibility}
          disabled={toggling}
          className={`p-1.5 rounded transition-colors ${doc.isPublic
            ? "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
            : "text-muted-foreground hover:bg-muted"}`}
          title={doc.isPublic ? "Make private" : "Make public"}
          data-testid={`btn-toggle-doc-${doc.id}`}
        >
          {toggling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : doc.isPublic ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>

        {/* Delete */}
        {confirmDelete ? (
          <div className="flex items-center gap-1">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="p-1.5 rounded bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
              title="Confirm delete"
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors"
              title="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
            title="Delete"
            data-testid={`btn-delete-doc-${doc.id}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Admin Documents Card ─────────────────────────────────────────────────────

export function AdminDocumentsCard({
  token, slug, muniId,
}: {
  token: string | null;
  slug: string;
  muniId: number;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: docs = [], isLoading } = useQuery<BudgetDocument[]>({
    queryKey: tKey("/api/documents", slug),
    queryFn: async () => {
      const res = await authFetch(`/api/documents?tenant=${slug}`, token);
      if (!res.ok) throw new Error("Failed to load documents");
      return res.json();
    },
    enabled: open,
  });

  const { data: years = [] } = useQuery<string[]>({
    queryKey: tKey("/api/years", slug),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: tKey("/api/documents", slug) });

  const publicCount = docs.filter(d => d.isPublic).length;

  return (
    <div className="border rounded-xl overflow-hidden">
      {/* Collapsible header */}
      <button
        className="w-full flex items-center justify-between px-5 py-4 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
        onClick={() => setOpen(o => !o)}
        data-testid="btn-toggle-documents-card"
      >
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">Budget Documents</p>
            <p className="text-xs text-muted-foreground">
              Upload PDFs and files — toggle which ones appear on the public dashboard
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {docs.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {publicCount}/{docs.length} public
            </Badge>
          )}
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="p-5 border-t space-y-4">
          {/* Upload zone */}
          <UploadZone
            token={token}
            slug={slug}
            muniId={muniId}
            years={years}
            onUploaded={refresh}
          />

          {/* Document list */}
          {isLoading ? (
            <div className="py-6 text-center text-xs text-muted-foreground animate-pulse">Loading documents…</div>
          ) : docs.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-xs text-muted-foreground">No documents uploaded yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Upload budget PDFs, reports, or spreadsheets above.</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex-1">
                  {docs.length} document{docs.length !== 1 ? "s" : ""}
                </p>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Eye className="h-3 w-3" />Public — visible on dashboard</span>
                  <span className="flex items-center gap-1"><EyeOff className="h-3 w-3" />Private — admin only</span>
                </div>
              </div>
              {docs.map(doc => (
                <AdminDocRow
                  key={doc.id}
                  doc={doc}
                  token={token}
                  slug={slug}
                  muniId={muniId}
                  onRefresh={refresh}
                />
              ))}
            </div>
          )}

          {/* Visibility tip */}
          {docs.some(d => !d.isPublic) && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/40 text-xs text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
              <span>
                {docs.filter(d => !d.isPublic).length} document{docs.filter(d => !d.isPublic).length !== 1 ? "s are" : " is"} private.
                Click the <Eye className="h-3 w-3 inline mx-0.5" /> icon to make them visible to citizens.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Public Budget Documents Section ─────────────────────────────────────────

export function PublicBudgetDocuments({ slug, activeYear }: { slug: string; activeYear?: string }) {
  const { data: docs = [], isLoading } = useQuery<BudgetDocument[]>({
    queryKey: tKey("/api/documents/public", slug),
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/documents?tenant=${slug}`);
      if (!res.ok) return [];
      const all: BudgetDocument[] = await res.json();
      return all.filter(d => d.isPublic);
    },
  });

  if (isLoading || docs.length === 0) return null;

  // Filter to docs matching the selected year (plus "General" / untagged docs)
  const filtered = activeYear
    ? docs.filter(d => !d.year || d.year === activeYear)
    : docs;

  if (filtered.length === 0) return null;

  // Group by year
  const byYear = filtered.reduce<Record<string, BudgetDocument[]>>((acc, doc) => {
    const key = doc.year || "General";
    if (!acc[key]) acc[key] = [];
    acc[key].push(doc);
    return acc;
  }, {});

  const years = Object.keys(byYear).sort((a, b) => b.localeCompare(a));

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b bg-muted/20">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Budget Documents</h2>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Official budget documents and reports — click to view or download.
        </p>
      </div>

      <div className="p-4 space-y-4">
        {years.map(year => (
          <div key={year}>
            {years.length > 1 && (
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                {year}
              </p>
            )}
            <div className="space-y-1.5">
              {byYear[year].map(doc => (
                <a
                  key={doc.id}
                  href={docUrl(doc.municipalityId, doc.filename)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors group"
                  data-testid={`link-public-doc-${doc.id}`}
                >
                  <div className="shrink-0">{fileIcon(doc.mimeType)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium group-hover:text-primary transition-colors truncate">
                      {doc.originalName}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">{formatBytes(doc.size)}</span>
                      {doc.description && (
                        <>
                          <span className="text-[10px] text-muted-foreground">·</span>
                          <span className="text-[10px] text-muted-foreground truncate">{doc.description}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <Download className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
