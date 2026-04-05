import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useTenantSlug } from "@/hooks/use-tenant";
import { tKey, useMunicipality } from "@/hooks/use-budget-data";
import type { UploadHistory, CitizenComment, EmailSubscriber } from "@shared/schema";
import {
  Upload, FileText, CheckCircle2, AlertCircle, Lock, LogOut, ShieldCheck,
  Eye, EyeOff, Code2, MessageSquare, Mail, Trash2, ThumbsUp, ChevronDown,
  ChevronUp, FileSpreadsheet, Table, ArrowRight, Users, Globe,
  Sparkles, Loader2, AlertTriangle, Info, X,
} from "lucide-react";

import { API_BASE } from "@/lib/api-base";
import { DataEditor } from "@/components/data-editor";
import { AdminDocumentsCard } from "@/components/budget-documents";

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

// ─── Login gate ───────────────────────────────────────────────────────────────
function LoginGate() {
  const { login, isLoading, error } = useAuth();
  const slug = useTenantSlug();
  const [password, setPassword] = useState("");

  return (
    <div className="p-4 md:p-6 max-w-[900px] mx-auto">
      <h1 className="text-xl font-bold mb-1">Admin Panel</h1>
      <p className="text-sm text-muted-foreground mb-8">Manage data uploads, publish settings, and citizen feedback.</p>
      <Card className="max-w-sm mx-auto" data-testid="card-login">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-base">Admin Access Required</CardTitle>
          <CardDescription>Enter your administrator password to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={async e => { e.preventDefault(); await login(password, slug); }} className="space-y-4">
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Admin password"
              autoFocus
              data-testid="input-admin-password"
            />
            {error && (
              <p className="text-sm text-destructive flex items-center gap-1" data-testid="text-login-error">
                <AlertCircle className="h-3.5 w-3.5" />{error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={!password.trim() || isLoading} data-testid="btn-login">
              {isLoading ? "Verifying…" : "Sign In"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Publish toggle card ──────────────────────────────────────────────────────
function PublishCard({
  section, label, description, published, token, slug,
}: {
  section: string; label: string; description: string;
  published: boolean; token: string | null; slug: string;
}) {
  const qc = useQueryClient();
  const [optimistic, setOptimistic] = useState(published);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    const next = !optimistic;
    setOptimistic(next);
    setLoading(true);
    try {
      await authFetch(`/api/publish?tenant=${slug}`, token, {
        method: "POST",
        body: JSON.stringify({ section, published: next }),
      });
      qc.invalidateQueries({ queryKey: tKey("/api/municipality", slug) });
    } catch {
      setOptimistic(!next); // revert
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Button
        size="sm"
        variant={optimistic ? "default" : "outline"}
        onClick={toggle}
        disabled={loading}
        className={`shrink-0 gap-1.5 ${optimistic ? "bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600" : ""}`}
        data-testid={`btn-publish-${section}`}
      >
        {optimistic ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        {optimistic ? "Published" : "Draft"}
      </Button>
    </div>
  );
}

// ─── Directory listing toggle ────────────────────────────────────────────────
function DirectoryListingCard({
  listed, token, slug,
}: { listed: boolean; token: string | null; slug: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [optimistic, setOptimistic] = useState(listed);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    const next = !optimistic;
    setOptimistic(next);
    setLoading(true);
    try {
      const res = await authFetch(`/api/listing?tenant=${slug}`, token, {
        method: "POST",
        body: JSON.stringify({ listed: next }),
      });
      if (!res.ok) throw new Error("Failed");
      qc.invalidateQueries({ queryKey: tKey("/api/municipality", slug) });
      toast({
        title: next ? "Municipality listed" : "Municipality unlisted",
        description: next
          ? "Your municipality now appears in the public directory."
          : "Your municipality has been removed from the public directory.",
      });
    } catch {
      setOptimistic(!next);
      toast({ title: "Error", description: "Could not update listing status.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">Directory Listing</CardTitle>
        </div>
        <CardDescription>
          Control whether your municipality appears in the public explorer, where
          citizens can discover and browse budget dashboards by state.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4 py-2">
          <div>
            <p className="text-sm font-medium">
              {optimistic ? "Listed — visible to the public" : "Unlisted — hidden from directory"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {optimistic
                ? "Citizens can find your municipality in the explorer and view your published budget data."
                : "Visitors who navigate directly to your URL will see a placeholder until you enable listing."
              }
            </p>
          </div>
          <Button
            size="sm"
            variant={optimistic ? "default" : "outline"}
            onClick={toggle}
            disabled={loading}
            className={`shrink-0 gap-1.5 ${optimistic ? "bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600" : ""}`}
            data-testid="btn-listing-toggle"
          >
            <Globe className="h-3.5 w-3.5" />
            {optimistic ? "Listed" : "Unlisted"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Upload type constants (used by BudgetChatbot CSV tab) ──────────────────
type UploadType = "departments" | "revenue" | "projects";

const TYPE_LABELS: Record<UploadType, string> = {
  departments: "Department Budgets",
  revenue: "Revenue Sources",
  projects: "Capital Projects",
};

const REQUIRED_COLS: Record<UploadType, { key: string; label: string; hints: string[] }[]> = {
  departments: [
    { key: "department", label: "Department", hints: ["department", "dept"] },
    { key: "category", label: "Sub-Category", hints: ["category", "sub-category", "line item"] },
    { key: "budgetedAmount", label: "Budgeted Amount", hints: ["budgeted amount", "budgeted", "budget"] },
    { key: "spentAmount", label: "Spent / Actual", hints: ["spent amount", "spent", "actual", "expenditure"] },
  ],
  revenue: [
    { key: "source", label: "Revenue Source", hints: ["source", "revenue source", "name"] },
    { key: "category", label: "Category", hints: ["category", "type", "revenue type"] },
    { key: "budgetedAmount", label: "Budgeted Amount", hints: ["budgeted amount", "budgeted", "budget"] },
    { key: "collectedAmount", label: "Collected / Actual", hints: ["collected amount", "collected", "actual", "received"] },
  ],
  projects: [
    { key: "name", label: "Project Name", hints: ["name", "project", "project name"] },
    { key: "department", label: "Department", hints: ["department", "dept"] },
    { key: "totalBudget", label: "Total Budget", hints: ["total budget", "budget"] },
    { key: "spentToDate", label: "Spent to Date", hints: ["spent to date", "spent"] },
    { key: "percentComplete", label: "% Complete", hints: ["percent complete", "% complete", "progress"] },
    { key: "status", label: "Status", hints: ["status"] },
  ],
};

const SAMPLE_CSV: Record<UploadType, string> = {
  departments: `Department,Category,Budgeted Amount,Spent Amount\nPublic Safety,Police Department,5200000,4680000\nPublic Safety,Fire Department,3800000,3420000\nEducation,K-12 Schools,12500000,11250000`,
  revenue: `Source,Category,Budgeted Amount,Collected Amount\nResidential Property Tax,Property Taxes,18200000,17890000\nEducation Fund Grant,State Aid,8400000,8400000\nBuilding Permits & Fees,Fees,1200000,1150000`,
  projects: `Name,Department,Total Budget,Spent To Date,Percent Complete,Status\nMain Street Bridge,Public Works,4200000,2940000,68,on-track\nSolar Installation,Education,1800000,1260000,55,at-risk`,
};

// ─── Import row schema ────────────────────────────────────────────────────────
interface ImportRow {
  Department: string;
  Category: string;
  "Budgeted Amount": number | null;
  "Spent Amount": number | null;
  Year: string;
}

// ─── Chat message types ───────────────────────────────────────────────────────
interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  rows?: ImportRow[];
  questions?: string[];
  mode?: "import_proposal" | "needs_clarification" | "answer";
  confidence?: number;
  notes?: string[];
}

// ─── Budget Chatbot ───────────────────────────────────────────────────────────
function BudgetChatbot({ token, slug }: { token: string | null; slug: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const chatFileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "assistant",
      content: "Upload a budget PDF to get proposed import rows, or ask me a question about the import workflow.",
      mode: "answer",
    },
  ]);
  const [input, setInput] = useState("");
  const [pendingFile, setPendingFile] = useState<{ name: string; base64: string; mimeType: string } | null>(null);
  const [loading, setLoading] = useState(false);

  // Proposed rows (editable) — set when AI returns import_proposal
  const [proposedRows, setProposedRows] = useState<ImportRow[] | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  // CSV import state (feeds into existing handleFile → map → confirm flow)
  const fileRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"choose" | "map" | "confirm">("choose");
  const [uploadType, setUploadType] = useState<UploadType>("departments");
  const [uploadYear, setUploadYear] = useState("FY2026");
  const [rawData, setRawData] = useState("");
  const [fileFormat, setFileFormat] = useState("csv");
  const [preview, setPreview] = useState<{ headers: string[]; preview: Record<string, string>[]; rows?: Record<string, string>[]; totalRows: number } | null>(null);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showSample, setShowSample] = useState(false);
  const [inputMode, setInputMode] = useState<"chat" | "csv">("csv");

  const scrollToBottom = () => setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

  // ── File attach handler ──────────────────────────────────────────────────────
  const handleChatFile = useCallback(async (file: File) => {
    const ALLOWED = ["application/pdf", "text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel", "text/plain"];
    if (!ALLOWED.includes(file.type) && !file.name.endsWith(".pdf") && !file.name.endsWith(".csv")) {
      toast({ title: "Unsupported file", description: "Attach a PDF, CSV, or Excel file.", variant: "destructive" });
      return;
    }
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    setPendingFile({ name: file.name, base64, mimeType: file.type || "application/pdf" });
    toast({ title: "File ready", description: `${file.name} attached — send a message or just hit Send to analyze.` });
  }, [toast]);

  // ── Send to /api/chat ────────────────────────────────────────────────────────
  const sendMessage = async (overrideContent?: string) => {
    const userText = overrideContent ?? input.trim();
    if (!userText && !pendingFile) return;

    const userMsg: ChatMsg = {
      role: "user",
      content: userText || (pendingFile ? `Analyze this file: ${pendingFile.name}` : ""),
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    scrollToBottom();

    try {
      // Build wire messages (exclude the intro system message from message history)
      const wireMessages = nextMessages
        .filter(m => !(m.role === "assistant" && m.mode === "answer" && nextMessages.indexOf(m) === 0))
        .map(m => ({ role: m.role, content: m.content }));

      const body: Record<string, unknown> = { messages: wireMessages };
      if (pendingFile) {
        body.fileData = pendingFile.base64;
        body.fileName = pendingFile.name;
        body.mimeType = pendingFile.mimeType;
      }

      const res = await authFetch(`/api/chat?tenant=${slug}`, token, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("AI service unavailable");
      const data = await res.json();

      const assistantMsg: ChatMsg = {
        role: "assistant",
        mode: data.mode,
        content: data.mode === "import_proposal"
          ? `I found ${data.rows?.length ?? 0} rows to import (confidence: ${Math.round((data.confidence ?? 0) * 100)}%).${data.notes?.length ? " " + data.notes.join(" ") : ""}`
          : data.mode === "needs_clarification"
          ? (data.questions?.join(" ") || "I need a bit more information.")
          : (data.text || "Done."),
        rows: data.rows ?? [],
        questions: data.questions ?? [],
        confidence: data.confidence,
        notes: data.notes ?? [],
      };

      setMessages(prev => [...prev, assistantMsg]);

      if (data.mode === "import_proposal" && data.rows?.length > 0) {
        setProposedRows(data.rows);
      }

      setPendingFile(null);
      scrollToBottom();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setMessages(prev => [...prev, { role: "assistant", mode: "answer", content: "Something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  // ── Edit a proposed row ──────────────────────────────────────────────────────
  const updateRow = (idx: number, field: keyof ImportRow, value: string) => {
    setProposedRows(rows => rows?.map((r, i) => i !== idx ? r : {
      ...r,
      [field]: (field === "Budgeted Amount" || field === "Spent Amount")
        ? (value === "" ? null : Number(value) || null)
        : value,
    }) ?? null);
  };

  const addRow = () => setProposedRows(rows => [
    ...(rows ?? []),
    { Department: "", Category: "", "Budgeted Amount": null, "Spent Amount": null, Year: uploadYear },
  ]);

  const removeRow = (idx: number) => setProposedRows(rows => rows?.filter((_, i) => i !== idx) ?? null);

  // ── Download proposed rows as CSV ────────────────────────────────────────────
  const downloadCsv = () => {
    if (!proposedRows?.length) return;
    const header = "Department,Category,Budgeted Amount,Spent Amount,Year";
    const body = proposedRows.map(r =>
      [r.Department, r.Category, r["Budgeted Amount"] ?? "", r["Spent Amount"] ?? "", r.Year]
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    ).join("\n");
    const blob = new Blob([header + "\n" + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "budget-import.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Import proposed rows directly via the existing /api/upload flow ───────────
  const importRows = async () => {
    if (!proposedRows?.length) return;
    const header = "Department,Category,Budgeted Amount,Spent Amount,Year";
    const body = proposedRows.map(r =>
      [r.Department, r.Category, r["Budgeted Amount"] ?? "", r["Spent Amount"] ?? "", r.Year]
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    ).join("\n");
    const csv = header + "\n" + body;

    // Detect year from first row — accept both "FY2025" and "2025" formats
    const detectedYear = proposedRows[0]?.Year || uploadYear;
    const VALID_YEARS = ["FY2027","FY2026","FY2025","FY2024","FY2023","2027","2026","2025","2024","2023"];
    const validYear = VALID_YEARS.includes(detectedYear) ? detectedYear : uploadYear;
    setUploadYear(validYear);
    setUploadType("departments");
    setRawData(csv);
    setFileFormat("csv");

    // Preview it
    setIsPreviewing(true);
    try {
      const res = await authFetch(`/api/upload/preview?tenant=${slug}`, token, {
        method: "POST",
        body: JSON.stringify({ data: csv, format: "csv" }),
      });
      const p = await res.json();
      setPreview(p);
      // Auto-map: our CSV columns match exactly
      setColumnMap({
        department: "Department",
        category: "Category",
        budgetedAmount: "Budgeted Amount",
        spentAmount: "Spent Amount",
      });
      setStep("map");
      setInputMode("csv");
    } catch {
      toast({ title: "Could not preview rows", variant: "destructive" });
    } finally { setIsPreviewing(false); }
  };

  // ── CSV import helpers (unchanged logic from previous UploadWizard) ───────────
  function autoMap(headers: string[]) {
    const map: Record<string, string> = {};
    for (const col of REQUIRED_COLS[uploadType]) {
      const match = headers.find(h => col.hints.some(hint => h.toLowerCase() === hint.toLowerCase()));
      if (match) map[col.key] = match;
    }
    return map;
  }

  const handleFile = async (file: File) => {
    const isXlsx = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");
    setFileFormat(isXlsx ? "xlsx" : "csv");
    const reader = new FileReader();
    reader.onload = async (e) => {
      const data = isXlsx ? (e.target?.result as string).split(",")[1] : (e.target?.result as string);
      setRawData(data);
      setIsPreviewing(true);
      try {
        const res = await authFetch(`/api/upload/preview?tenant=${slug}`, token, {
          method: "POST",
          body: JSON.stringify({ data, format: isXlsx ? "xlsx" : "csv" }),
        });
        const p = await res.json();
        setPreview(p);
        setColumnMap(autoMap(p.headers));
        setStep("map");
      } catch { toast({ title: "Could not parse file", variant: "destructive" }); }
      finally { setIsPreviewing(false); }
    };
    if (isXlsx) reader.readAsDataURL(file); else reader.readAsText(file);
  };

  const handlePastePreview = async () => {
    if (!rawData.trim()) return;
    setIsPreviewing(true);
    try {
      const res = await authFetch(`/api/upload/preview?tenant=${slug}`, token, {
        method: "POST",
        body: JSON.stringify({ data: rawData, format: "csv" }),
      });
      const p = await res.json();
      setPreview(p);
      setColumnMap(autoMap(p.headers));
      setStep("map");
    } catch { toast({ title: "Could not parse data", variant: "destructive" }); }
    finally { setIsPreviewing(false); }
  };

  const handleImport = async () => {
    setIsUploading(true);
    try {
      const res = await authFetch(`/api/upload?tenant=${slug}`, token, {
        method: "POST",
        body: JSON.stringify({ data: rawData, type: uploadType, year: uploadYear, format: fileFormat, columnMap }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const d = await res.json();
      toast({ title: "Import successful", description: `${d.recordCount} records imported for ${uploadYear}.` });
      setStep("choose"); setRawData(""); setPreview(null); setColumnMap({}); setProposedRows(null);
      qc.invalidateQueries({ queryKey: tKey("/api/uploads", slug) });
      qc.invalidateQueries({ queryKey: tKey("/api/departments", slug) });
      qc.invalidateQueries({ queryKey: tKey("/api/revenue", slug) });
      qc.invalidateQueries({ queryKey: tKey("/api/projects", slug) });
    } catch (e: any) {
      toast({ title: "Import failed", description: e.message, variant: "destructive" });
    } finally { setIsUploading(false); }
  };

  const [lastTab, setLastTab] = useState<"chat" | "csv">("csv");
  const resetToChoose = () => {
    setStep("choose"); setInputMode(lastTab);
    setRawData(""); setPreview(null); setColumnMap({});
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <Card data-testid="card-upload-wizard">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Import Budget Data</CardTitle>
            <CardDescription>
              Chat with the AI to analyze a budget document and get proposed import rows, or switch to CSV/Excel for manual entry.
            </CardDescription>
          </div>
          {/* Mode tabs */}
          <div className="flex gap-1 p-1 bg-muted rounded-lg shrink-0">
            <button
              onClick={() => { setLastTab("chat"); setInputMode("chat"); setStep("choose"); }}
              className={`flex items-center gap-1.5 text-xs py-1.5 px-3 rounded-md font-medium transition-colors ${
                inputMode === "chat" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="tab-chat"
            >
              <Sparkles className="h-3 w-3" />AI Chat
            </button>
            <button
              onClick={() => { setLastTab("csv"); setInputMode("csv"); setStep("choose"); }}
              className={`flex items-center gap-1.5 text-xs py-1.5 px-3 rounded-md font-medium transition-colors ${
                inputMode === "csv" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid="tab-csv"
            >
              <FileSpreadsheet className="h-3 w-3" />CSV / Excel
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">

        {/* ── AI CHAT TAB ─────────────────────────────────────────────────────── */}
        {inputMode === "chat" && step === "choose" && (
          <div className="space-y-3">
            {/* Message thread */}
            <div className="min-h-[200px] max-h-[360px] overflow-y-auto space-y-3 pr-1" data-testid="chat-thread">
              {messages.map((m, i) => (
                <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  {m.role === "assistant" && (
                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                    </div>
                  )}
                  <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}>
                    <p>{m.content}</p>
                    {m.mode === "needs_clarification" && m.questions && m.questions.length > 0 && (
                      <ul className="mt-1.5 space-y-1">
                        {m.questions.map((q, qi) => (
                          <li key={qi} className="flex items-start gap-1">
                            <span className="text-amber-500 mt-px">•</span>
                            <button
                              className="text-left underline underline-offset-2 text-amber-700 dark:text-amber-300 hover:no-underline"
                              onClick={() => sendMessage(q)}
                            >{q}</button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex gap-2 justify-start">
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
                  </div>
                  <div className="bg-muted rounded-xl px-3 py-2 text-xs text-muted-foreground animate-pulse">Analyzing…</div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Pending file badge */}
            {pendingFile && (
              <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-xs">
                <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="flex-1 truncate font-medium">{pendingFile.name}</span>
                <button onClick={() => setPendingFile(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Input row */}
            <div className="flex gap-2">
              <button
                onClick={() => chatFileRef.current?.click()}
                className="p-2 rounded-lg border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
                title="Attach PDF or CSV"
                data-testid="btn-attach-file"
              >
                <Upload className="h-4 w-4" />
              </button>
              <input
                ref={chatFileRef}
                type="file"
                className="hidden"
                accept=".pdf,.csv,.xlsx,.xls"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleChatFile(f); e.target.value = ""; }}
              />
              <input
                className="flex-1 h-9 rounded-lg border border-input bg-background px-3 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Ask a question or attach a budget PDF…"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !loading) { e.preventDefault(); sendMessage(); }}}
                data-testid="chat-input"
              />
              <Button
                size="sm"
                onClick={() => sendMessage()}
                disabled={loading || (!input.trim() && !pendingFile)}
                className="shrink-0"
                data-testid="btn-chat-send"
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Proposed rows table */}
            {proposedRows && proposedRows.length > 0 && (
              <div className="space-y-2 pt-1 border-t">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold">Proposed Import Rows ({proposedRows.length})</p>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={downloadCsv} data-testid="btn-download-csv">
                      <FileSpreadsheet className="h-3 w-3" />CSV
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addRow} data-testid="btn-add-row">
                      <Upload className="h-3 w-3" />Add row
                    </Button>
                    <Button size="sm" className="h-7 text-xs gap-1" onClick={importRows} disabled={isPreviewing} data-testid="btn-import-rows">
                      {isPreviewing ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
                      Import
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto rounded-lg border text-xs">
                  <table className="w-full">
                    <thead className="bg-muted">
                      <tr>
                        {["Department","Category","Budgeted Amount","Spent Amount","Year"].map(h => (
                          <th key={h} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                        ))}
                        <th className="px-2 py-1.5 w-6" />
                      </tr>
                    </thead>
                    <tbody>
                      {proposedRows.map((row, i) => (
                        <tr key={i} className="border-t hover:bg-muted/30">
                          {(["Department","Category","Budgeted Amount","Spent Amount","Year"] as (keyof ImportRow)[]).map(field => (
                            <td key={field} className="px-1 py-1">
                              <input
                                className="w-full bg-transparent px-1.5 py-0.5 rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-xs"
                                value={row[field] ?? ""}
                                onChange={e => updateRow(i, field, e.target.value)}
                                placeholder={field === "Spent Amount" ? "optional" : ""}
                                data-testid={`row-${i}-${field.replace(/ /g,"-")}`}
                              />
                            </td>
                          ))}
                          <td className="px-1 py-1 text-center">
                            <button onClick={() => removeRow(i)} className="text-muted-foreground hover:text-destructive">
                              <X className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-muted-foreground">Edit rows directly, then click Import to continue to column mapping.</p>
              </div>
            )}
          </div>
        )}

        {/* ── CSV / Excel TAB ──────────────────────────────────────────────────── */}
        {inputMode === "csv" && step === "choose" && (
          <>
            {/* Type + Year row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-medium mb-1.5 block text-muted-foreground uppercase tracking-wide">Data Type</label>
                <div className="flex gap-2">
                  {(["departments", "revenue", "projects"] as UploadType[]).map(t => (
                    <button
                      key={t}
                      onClick={() => setUploadType(t)}
                      className={`flex-1 text-xs py-2 px-2 rounded-md border font-medium transition-colors ${uploadType === t ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-input"}`}
                      data-testid={`btn-type-${t}`}
                    >{TYPE_LABELS[t]}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block text-muted-foreground uppercase tracking-wide">Fiscal Year</label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={uploadYear}
                  onChange={e => setUploadYear(e.target.value)}
                  data-testid="select-upload-year"
                >
                  {["FY2027","FY2026","FY2025","FY2024"].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            {/* Drag-drop zone */}
            <div
              className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              data-testid="drop-zone"
            >
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              <FileSpreadsheet className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              <p className="text-sm font-medium">Drop a file here or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">Supports .csv, .xlsx, and .xls</p>
              {isPreviewing && <p className="text-xs text-primary mt-2 animate-pulse">Parsing file…</p>}
            </div>

            <div className="relative flex items-center gap-2">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">or paste CSV text</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Paste CSV</label>
                <button className="text-xs text-primary underline-offset-2 hover:underline" onClick={() => setShowSample(!showSample)}>
                  {showSample ? "Hide" : "Show"} sample format
                </button>
              </div>
              {showSample && (
                <pre className="text-xs bg-muted rounded p-2 overflow-x-auto text-muted-foreground">{SAMPLE_CSV[uploadType]}</pre>
              )}
              <textarea
                className="w-full font-mono text-xs rounded-md border border-input bg-background p-2 min-h-[120px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                placeholder={SAMPLE_CSV[uploadType]}
                value={rawData}
                onChange={e => setRawData(e.target.value)}
                data-testid="textarea-csv"
              />
              <Button onClick={handlePastePreview} disabled={!rawData.trim() || isPreviewing} size="sm" variant="outline" className="w-full" data-testid="btn-preview">
                <Table className="h-3.5 w-3.5 mr-1.5" />Preview & Map Columns<ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            </div>
          </>
        )}

        {/* ── COLUMN MAPPING step (shared by both tabs) ────────────────────────── */}
        {step === "map" && preview && (
          <>
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium">{preview.totalRows} rows detected — map your columns below</p>
              <button onClick={resetToChoose} className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">← Back</button>
            </div>
            <div className="space-y-2">
              {REQUIRED_COLS[uploadType].map(col => (
                <div key={col.key} className="flex items-center gap-3">
                  <span className="text-xs font-medium w-36 shrink-0">{col.label}</span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  <select
                    className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={columnMap[col.key] || ""}
                    onChange={e => setColumnMap(m => ({ ...m, [col.key]: e.target.value }))}
                    data-testid={`select-col-${col.key}`}
                  >
                    <option value="">-- not mapped --</option>
                    {preview.headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                  {columnMap[col.key]
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    : <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />}
                </div>
              ))}
            </div>
            <div className="overflow-x-auto rounded-md border mt-2">
              <table className="text-xs w-full">
                <thead className="bg-muted">
                  <tr>{preview.headers.map(h => <th key={h} className="px-2 py-1.5 text-left font-medium text-muted-foreground">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {(preview.preview ?? preview.rows ?? []).slice(0,3).map((row, i) => (
                    <tr key={i} className="border-t">
                      {preview.headers.map(h => <td key={h} className="px-2 py-1.5 truncate max-w-[120px]">{row[h]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.totalRows > 3 && <p className="text-xs text-muted-foreground text-center py-1">+{preview.totalRows - 3} more rows</p>}
            </div>
            <Button onClick={() => setStep("confirm")} className="w-full" data-testid="btn-confirm-mapping">
              Looks good — Continue<ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </>
        )}

        {/* ── CONFIRM + IMPORT step ────────────────────────────────────────────── */}
        {step === "confirm" && preview && (
          <div className="space-y-4">
            <button onClick={() => setStep("map")} className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">← Back to column mapping</button>
            <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="font-medium">{TYPE_LABELS[uploadType]}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Fiscal Year</span><span className="font-medium">{uploadYear}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Rows to import</span><span className="font-medium">{preview.totalRows}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Columns mapped</span><span className="font-medium">{Object.keys(columnMap).length} / {REQUIRED_COLS[uploadType].length}</span></div>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md p-3 text-xs text-amber-800 dark:text-amber-300">
              This will replace all existing {TYPE_LABELS[uploadType]} data for {uploadYear}. This cannot be undone.
            </div>
            <Button onClick={handleImport} disabled={isUploading} className="w-full" data-testid="btn-import">
              <Upload className="h-4 w-4 mr-2" />
              {isUploading ? "Importing…" : `Import ${preview.totalRows} Records`}
            </Button>
          </div>
        )}

      </CardContent>
    </Card>
  );
}


// ─── Comment moderation ───────────────────────────────────────────────────────
function CommentModeration({ token, slug }: { token: string | null; slug: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: comments = [] } = useQuery<CitizenComment[]>({
    queryKey: [...tKey("/api/comments/all", slug)],
    enabled: open,
  });

  const pending = comments.filter(c => !c.approved);
  const approved = comments.filter(c => c.approved);

  const approve = async (id: number) => {
    await authFetch(`/api/comments/${id}/approve?tenant=${slug}`, token, { method: "PATCH" });
    qc.invalidateQueries({ queryKey: tKey("/api/comments/all", slug) });
    qc.invalidateQueries({ queryKey: tKey("/api/comments", slug) });
  };
  const remove = async (id: number) => {
    await authFetch(`/api/comments/${id}?tenant=${slug}`, token, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: tKey("/api/comments/all", slug) });
    qc.invalidateQueries({ queryKey: tKey("/api/comments", slug) });
  };

  return (
    <Card>
      <button className="w-full text-left" onClick={() => setOpen(o => !o)}>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Citizen Comments</CardTitle>
            {pending.length > 0 && (
              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs">
                {pending.length} pending
              </Badge>
            )}
          </div>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </CardHeader>
      </button>
      {open && (
        <CardContent className="pt-0 space-y-4">
          {comments.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No comments yet.</p>
          )}
          {pending.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Pending Approval</p>
              <div className="space-y-2">
                {pending.map(c => (
                  <div key={c.id} className="flex gap-3 p-3 rounded-lg bg-amber-50/50 dark:bg-amber-900/10 border border-amber-200/50 dark:border-amber-800/50">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium">{c.name || "Anonymous"} · <span className="capitalize text-muted-foreground">{c.section}</span></p>
                      <p className="text-sm mt-0.5 line-clamp-2">{c.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">{new Date(c.submittedAt).toLocaleString()}</p>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-emerald-700" onClick={() => approve(c.id)} data-testid={`btn-approve-${c.id}`}>
                        <ThumbsUp className="h-3 w-3" />Approve
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-destructive" onClick={() => remove(c.id)}>
                        <Trash2 className="h-3 w-3" />Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {approved.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Published ({approved.length})</p>
              <div className="space-y-1.5">
                {approved.map(c => (
                  <div key={c.id} className="flex items-start gap-3 p-2 rounded-md border">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium">{c.name || "Anonymous"} · <span className="capitalize text-muted-foreground">{c.section}</span></p>
                      <p className="text-xs text-muted-foreground line-clamp-1">{c.message}</p>
                    </div>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground" onClick={() => remove(c.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Subscribers + embed ──────────────────────────────────────────────────────
function EngagementPanel({ token, slug }: { token: string | null; slug: string }) {
  const [showEmbed, setShowEmbed] = useState(false);
  const { data: subs = [] } = useQuery<EmailSubscriber[]>({
    queryKey: tKey("/api/subscribers", slug),
    queryFn: () => authFetch(`/api/subscribers?tenant=${slug}`, token).then(r => r.ok ? r.json() : []),
    retry: false,
  });

  const embedCode = `<iframe
  src="${typeof window !== "undefined" ? `${window.location.origin}/?tenant=${slug}#/` : ""}" 
  width="100%" height="700"
  style="border:none;border-radius:8px;"
  title="Budget Transparency Dashboard"
></iframe>`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Citizen Engagement</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Subscribers */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Mail className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">{subs.length} email subscriber{subs.length !== 1 ? "s" : ""}</p>
            <p className="text-xs text-muted-foreground">Residents opted in to budget update notifications</p>
          </div>
        </div>

        {/* Embed code */}
        <div>
          <button
            className="flex items-center gap-1.5 text-sm font-medium hover:text-primary transition-colors"
            onClick={() => setShowEmbed(e => !e)}
          >
            <Code2 className="h-4 w-4" />
            Embed on your town website
            {showEmbed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {showEmbed && (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-muted-foreground">Paste this code into your municipality's website to embed the live dashboard.</p>
              <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all select-all border">{embedCode}</pre>
              <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => { navigator.clipboard?.writeText(embedCode); }}>
                Copy embed code
              </Button>
            </div>
          )}
        </div>

        {/* Shareable link */}
        <div>
          <p className="text-xs font-medium mb-1 text-muted-foreground uppercase tracking-wide">Public Dashboard Link</p>
          <div className="flex gap-2">
            <code className="flex-1 text-xs bg-muted rounded px-2 py-1.5 truncate">
              {typeof window !== "undefined" ? `${window.location.origin}/?tenant=${slug}#/` : ""}
            </code>
            <Button size="sm" variant="outline" className="text-xs shrink-0" onClick={() => navigator.clipboard?.writeText(`${window.location.origin}/?tenant=${slug}#/`)}>
              Copy
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Upload history ───────────────────────────────────────────────────────────
function UploadHistoryPanel({ token, slug }: { token: string | null; slug: string }) {
  const { data: uploads = [] } = useQuery<UploadHistory[]>({
    queryKey: tKey("/api/uploads", slug),
    queryFn: () => authFetch(`/api/uploads?tenant=${slug}`, token).then(r => r.ok ? r.json() : []),
    retry: false,
  });

  if (!uploads.length) return null;
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Import History</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {uploads.map(u => (
            <div key={u.id} className="flex items-center gap-3 py-1.5 border-b last:border-0">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{u.filename}</p>
                <p className="text-xs text-muted-foreground">{u.notes}</p>
              </div>
              <Badge className={u.status === "success" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : ""} variant={u.status === "success" ? "default" : "destructive"}>
                {u.status === "success" ? <><CheckCircle2 className="h-3 w-3 mr-1" />OK</> : <><AlertCircle className="h-3 w-3 mr-1" />Error</>}
              </Badge>
              <span className="text-xs text-muted-foreground tabular-nums shrink-0">{new Date(u.uploadedAt).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Admin dashboard ──────────────────────────────────────────────────────────
function AdminDashboard() {
  const { logout, getToken } = useAuth();
  const slug = useTenantSlug();
  const token = getToken();
  const { data: muni } = useMunicipality();

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[900px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Admin Panel</h1>
          <p className="text-sm text-muted-foreground">{muni?.name}, {muni?.state}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 py-1 text-emerald-600 border-emerald-200 dark:text-emerald-400 dark:border-emerald-800">
            <ShieldCheck className="h-3.5 w-3.5" />Admin
          </Badge>
          <Button variant="ghost" size="sm" onClick={() => logout(slug)} className="text-muted-foreground" data-testid="btn-logout">
            <LogOut className="h-4 w-4 mr-1.5" />Sign Out
          </Button>
        </div>
      </div>

      {/* Publish toggles */}
      {muni && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Publish Controls</CardTitle>
            <CardDescription>Toggle which sections are visible to the public. Draft sections are only visible to admins.</CardDescription>
          </CardHeader>
          <CardContent>
            <PublishCard section="revenue" label="Revenue Sources" description="Property taxes, state aid, grants and fee breakdowns" published={muni.revenuePublished} token={token} slug={slug} />
            <PublishCard section="departments" label="Department Spending" description="Budget allocations and spending by department" published={muni.departmentsPublished} token={token} slug={slug} />
            <PublishCard section="projects" label="Capital Projects" description="Infrastructure and major capital project tracker" published={muni.projectsPublished} token={token} slug={slug} />
          </CardContent>
        </Card>
      )}

      {/* Directory listing toggle */}
      {muni && (
        <DirectoryListingCard listed={muni.listed} token={token} slug={slug} />
      )}

      {/* Budget documents */}
      {muni && (
        <AdminDocumentsCard token={token} slug={slug} muniId={muni.id} />
      )}

      {/* Data editor — inline view + edit */}
      <DataEditor token={token} slug={slug} />

      {/* Upload wizard */}
      <BudgetChatbot token={token} slug={slug} />

      {/* Upload history */}
      <UploadHistoryPanel token={token} slug={slug} />

      {/* Comment moderation */}
      <CommentModeration token={token} slug={slug} />

      {/* Engagement */}
      <EngagementPanel token={token} slug={slug} />
    </div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────
export default function Admin() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <LoginGate />;
  return <AdminDashboard />;
}
