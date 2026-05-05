import { useState, useRef, useCallback } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useTenantSlug } from "@/hooks/use-tenant";
import { tKey, useMunicipality } from "@/hooks/use-budget-data";
import type { UploadHistory, CitizenComment, EmailSubscriber, FieldOption, PopulationFigure } from "@shared/schema";
import {
  Upload, FileText, CheckCircle2, AlertCircle, Lock, LogOut, ShieldCheck,
  Eye, EyeOff, Code2, MessageSquare, Mail, Trash2, ThumbsUp, ChevronDown,
  ChevronUp, FileSpreadsheet, Table, ArrowRight, Users, Globe,
  Sparkles, Loader2, AlertTriangle, Info, X, Building2, UserCircle2, Clock,
  Calendar, Pencil, Save, Minus, Plus, Tag, Download, FileDown,
} from "lucide-react";

import { API_BASE } from "@/lib/api-base";
import { normalizeYear, SELECTABLE_YEARS } from "@/lib/year-utils";
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

// ─── Login gate ─────────────────────────────────────────────────────
function LoginGate() {
  const { login, platformLogin, isLoading, error } = useAuth();
  const slug = useTenantSlug();
  const [isPlatformMode, setIsPlatformMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPlatformMode) {
      await platformLogin({ email, password });
    } else {
      await login({ email, password, tenantSlug: slug });
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-[900px] mx-auto">
      <h1 className="text-xl font-bold mb-1">Admin Portal</h1>
      <p className="text-sm text-muted-foreground mb-8">Sign in to manage data, publish settings, and citizen feedback.</p>

      {/* Login mode toggle */}
      <div className="flex gap-1 max-w-sm mx-auto mb-4 p-1 bg-muted rounded-lg">
        <button
          type="button"
          onClick={() => { setIsPlatformMode(false); setEmail(""); setPassword(""); }}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${!isPlatformMode ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          data-testid="btn-mode-municipal"
        >
          Municipality Admin
        </button>
        <button
          type="button"
          onClick={() => { setIsPlatformMode(true); setEmail(""); setPassword(""); }}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${isPlatformMode ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          data-testid="btn-mode-platform"
        >
          Platform Admin
        </button>
      </div>

      <Card className="max-w-sm mx-auto" data-testid="card-login">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            {isPlatformMode ? <ShieldCheck className="h-6 w-6 text-primary" /> : <Lock className="h-6 w-6 text-primary" />}
          </div>
          <CardTitle className="text-base">
            {isPlatformMode ? "Platform Admin Login" : "Municipality Admin Login"}
          </CardTitle>
          <CardDescription>
            {isPlatformMode
              ? "Access all municipalities with your platform admin account."
              : "Sign in with your municipal admin email and password."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Admin email address"
              autoFocus
              autoComplete="email"
              data-testid="input-admin-email"
            />
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              data-testid="input-admin-password"
            />
            {error && (
              <p className="text-sm text-destructive flex items-center gap-1" data-testid="text-login-error">
                <AlertCircle className="h-3.5 w-3.5" />{error}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={!email.trim() || !password.trim() || isLoading} data-testid="btn-login">
              {isLoading ? "Verifying…" : "Sign In"}
            </Button>
          </form>
          {!isPlatformMode && (
            <p className="text-xs text-muted-foreground text-center mt-3">
              Demo: <span className="font-mono">admin@maplewood-vt.gov</span> / <span className="font-mono">maplewood</span>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );}

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

// ─── Import row schemas — one per data type ───────────────────────────────────
interface DepartmentRow {
  Department: string;
  Category: string;
  "Budgeted Amount": number | null;
  "Spent Amount": number | null;
  Year: string;
}
interface RevenueRow {
  Source: string;
  Category: string;
  "Budgeted Amount": number | null;
  "Collected Amount": number | null;
  Year: string;
}
interface ProjectRow {
  Name: string;
  Department: string;
  "Total Budget": number | null;
  "Spent To Date": number | null;
  "Percent Complete": number | null;
  Status: string;
  Year: string;
}
type ImportRow = DepartmentRow | RevenueRow | ProjectRow;

// ─── Chat message types ───────────────────────────────────────────────────────
interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  rows?: ImportRow[];
  dataType?: "departments" | "revenue" | "projects" | null;
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
      content: "Post your financial data here as text, Excel, etc. or ask budget related questions to the application.",
      mode: "answer",
    },
  ]);
  const [input, setInput] = useState("");
  const [pendingFile, setPendingFile] = useState<{ name: string; base64: string; mimeType: string } | null>(null);
  const [loading, setLoading] = useState(false);

  // Proposed rows (editable) — set when AI returns import_proposal
  const [proposedRows, setProposedRows] = useState<ImportRow[] | null>(null);
  const [proposedDataType, setProposedDataType] = useState<UploadType>("departments");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  // CSV import state (feeds into existing handleFile → map → confirm flow)
  const fileRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"choose" | "map" | "confirm">("choose");
  const [uploadType, setUploadType] = useState<UploadType>("departments");
  const [uploadYear, setUploadYear] = useState("2026");
  const [rawData, setRawData] = useState("");
  const [fileFormat, setFileFormat] = useState("csv");
  const [preview, setPreview] = useState<{ headers: string[]; preview: Record<string, string>[]; rows?: Record<string, string>[]; totalRows: number } | null>(null);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showSample, setShowSample] = useState(false);
  const [importMode, setImportMode] = useState<"append" | "overwrite">("append");
  const [inputMode, setInputMode] = useState<"chat" | "csv">("csv");

  // ── Field options for dropdowns ────────────────────────────────────
  const { data: foAll = [] } = useQuery<FieldOption[]>({
    queryKey: tKey("/api/field-options", slug),
    queryFn: () => authFetch(`/api/field-options?tenant=${slug}`, token).then(r => r.ok ? r.json() : []),
    retry: false,
  });
  const foByType = (ft: string) => foAll.filter(o => o.fieldType === ft).map(o => o.value);

  const scrollToBottom = () => setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

  // ── File attach handler ──────────────────────────────────────────────────────
  const handleChatFile = useCallback(async (file: File) => {
    const ALLOWED = ["application/pdf", "text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel", "text/plain"];
    if (!ALLOWED.includes(file.type) && !file.name.endsWith(".pdf") && !file.name.endsWith(".csv")) {
      toast({ title: "Unsupported file", description: "Attach a CSV, Excel, or text file.", variant: "destructive" });
      return;
    }
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    setPendingFile({ name: file.name, base64, mimeType: file.type || "application/pdf" });
    toast({ title: "File ready", description: `${file.name} attached — send a message or hit Send to analyze.` });
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
      let data = await res.json();

      // ── Client-side safety net: detect import_proposal JSON in answer text ──
      // If the server returned mode=answer but the text looks like import_proposal JSON,
      // attempt to parse it and recover the structured data.
      if (data.mode === "answer" && data.text && /"mode"\s*:\s*"import_proposal"/.test(data.text)) {
        try {
          const jm = data.text.match(/\{[\s\S]*\}/);
          if (jm) {
            const recovered = JSON.parse(jm[0]);
            if (recovered.mode === "import_proposal" && Array.isArray(recovered.rows)) {
              data = { ...data, ...recovered };
            }
          }
        } catch { /* leave data unchanged */ }
      }

      const assistantMsg: ChatMsg = {
        role: "assistant",
        mode: data.mode,
        dataType: data.dataType ?? null,
        content: data.mode === "import_proposal"
          ? `I found ${data.rows?.length ?? 0} ${data.dataType ?? "department"} rows to import (confidence: ${Math.round((data.confidence ?? 0) * 100)}%).${data.notes?.length ? " " + data.notes.join(" ") : ""}`
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
        // Normalise Year values: strip any FY prefix (FY2026 → 2026)
        const normRows = (data.rows || []).map((r: any) => ({ ...r, Year: normalizeYear(r.Year) }));
        setProposedRows(normRows);
        // Use AI-detected data type; fall back to "departments"
        const detectedType: UploadType =
          ["departments","revenue","projects"].includes(data.dataType) ? data.dataType : "departments";
        setProposedDataType(detectedType);
        setUploadType(detectedType);
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
  const updateRow = (idx: number, field: string, value: string) => {
    const numericFields = ["Budgeted Amount","Spent Amount","Collected Amount","Total Budget","Spent To Date","Percent Complete"];
    setProposedRows(rows => rows?.map((r, i) => i !== idx ? r : {
      ...r,
      [field]: numericFields.includes(field)
        ? (value === "" ? null : Number(value) || null)
        : value,
    }) ?? null);
  };

  const addRow = () => {
    const empty: ImportRow = proposedDataType === "revenue"
      ? { Source: "", Category: "", "Budgeted Amount": null, "Collected Amount": null, Year: uploadYear }
      : proposedDataType === "projects"
      ? { Name: "", Department: "", "Total Budget": null, "Spent To Date": null, "Percent Complete": null, Status: "on-track", Year: uploadYear }
      : { Department: "", Category: "", "Budgeted Amount": null, "Spent Amount": null, Year: uploadYear };
    setProposedRows(rows => [...(rows ?? []), empty]);
  };

  const removeRow = (idx: number) => setProposedRows(rows => rows?.filter((_, i) => i !== idx) ?? null);

  // ── Download proposed rows as CSV ────────────────────────────────────────────
  const downloadCsv = () => {
    if (!proposedRows?.length) return;
    let header: string;
    let body: string;
    if (proposedDataType === "revenue") {
      header = "Source,Category,Budgeted Amount,Collected Amount,Year";
      body = proposedRows.map(r => { const rr = r as RevenueRow;
        return [rr.Source, rr.Category, rr["Budgeted Amount"] ?? "", rr["Collected Amount"] ?? "", rr.Year]
          .map(v => `"${String(v).replace(/"/g, '""')}"`).join(","); }).join("\n");
    } else if (proposedDataType === "projects") {
      header = "Name,Department,Total Budget,Spent To Date,Percent Complete,Status,Year";
      body = proposedRows.map(r => { const pr = r as ProjectRow;
        return [pr.Name, pr.Department, pr["Total Budget"] ?? "", pr["Spent To Date"] ?? "", pr["Percent Complete"] ?? "", pr.Status, pr.Year]
          .map(v => `"${String(v).replace(/"/g, '""')}"`).join(","); }).join("\n");
    } else {
      header = "Department,Category,Budgeted Amount,Spent Amount,Year";
      body = proposedRows.map(r => { const dr = r as DepartmentRow;
        return [dr.Department, dr.Category, dr["Budgeted Amount"] ?? "", dr["Spent Amount"] ?? "", dr.Year]
          .map(v => `"${String(v).replace(/"/g, '""')}"`).join(","); }).join("\n");
    }
    const blob = new Blob([header + "\n" + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "budget-import.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Import proposed rows directly via the existing /api/upload flow ───────────
  const importRows = async () => {
    if (!proposedRows?.length) return;

    // Build CSV and column map based on the detected data type
    let csv: string;
    let colMap: Record<string, string>;

    if (proposedDataType === "revenue") {
      const header = "Source,Category,Budgeted Amount,Collected Amount,Year";
      const rows = proposedRows as RevenueRow[];
      const body = rows.map(r =>
        [r.Source, r.Category, r["Budgeted Amount"] ?? "", r["Collected Amount"] ?? "", r.Year]
          .map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")
      ).join("\n");
      csv = header + "\n" + body;
      colMap = { source: "Source", category: "Category", budgetedAmount: "Budgeted Amount", collectedAmount: "Collected Amount" };
    } else if (proposedDataType === "projects") {
      const header = "Name,Department,Total Budget,Spent To Date,Percent Complete,Status,Year";
      const rows = proposedRows as ProjectRow[];
      const body = rows.map(r =>
        [r.Name, r.Department, r["Total Budget"] ?? "", r["Spent To Date"] ?? "", r["Percent Complete"] ?? "", r.Status, r.Year]
          .map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")
      ).join("\n");
      csv = header + "\n" + body;
      colMap = { name: "Name", department: "Department", totalBudget: "Total Budget", spentToDate: "Spent To Date", percentComplete: "Percent Complete", status: "Status" };
    } else {
      const header = "Department,Category,Budgeted Amount,Spent Amount,Year";
      const rows = proposedRows as DepartmentRow[];
      const body = rows.map(r =>
        [r.Department, r.Category, r["Budgeted Amount"] ?? "", r["Spent Amount"] ?? "", r.Year]
          .map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")
      ).join("\n");
      csv = header + "\n" + body;
      colMap = { department: "Department", category: "Category", budgetedAmount: "Budgeted Amount", spentAmount: "Spent Amount" };
    }

    // Normalise year: extract plain 4-digit number from any format
    const firstRow = proposedRows[0] as any;
    const detectedYear = normalizeYear(firstRow?.Year || uploadYear || "");
    const validYear = (SELECTABLE_YEARS as readonly string[]).includes(detectedYear) ? detectedYear : (detectedYear || uploadYear);

    setUploadYear(validYear);
    setUploadType(proposedDataType);
    setRawData(csv);
    setFileFormat("csv");

    setIsPreviewing(true);
    try {
      const res = await authFetch(`/api/upload/preview?tenant=${slug}`, token, {
        method: "POST",
        body: JSON.stringify({ data: csv, format: "csv" }),
      });
      const p = await res.json();
      setPreview(p);
      setColumnMap(colMap);
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
        body: JSON.stringify({ data: rawData, type: uploadType, year: uploadYear, format: fileFormat, columnMap, importMode }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const d = await res.json();
      toast({ title: "Import successful", description: `${d.recordCount} records imported for ${uploadYear}.` });
      setStep("choose"); setRawData(""); setPreview(null); setColumnMap({}); setProposedRows(null);
      qc.invalidateQueries({ queryKey: tKey("/api/uploads", slug) });
      qc.invalidateQueries({ queryKey: tKey("/api/departments", slug) });
      qc.invalidateQueries({ queryKey: tKey("/api/revenue", slug) });
      qc.invalidateQueries({ queryKey: tKey("/api/projects", slug) });
      // Refresh DataEditor year-specific queries + summary/years
      qc.invalidateQueries({ queryKey: tKey(`/api/departments/${uploadYear}`, slug) });
      qc.invalidateQueries({ queryKey: tKey(`/api/revenue/${uploadYear}`, slug) });
      qc.invalidateQueries({ queryKey: tKey("/api/years", slug) });
      qc.invalidateQueries({ queryKey: tKey("/api/summary", slug) });
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
              Post your financial data as text or Excel, or ask budget related questions. Switch to CSV / Excel for manual entry.
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
                title="Attach CSV or Excel file"
                data-testid="btn-attach-file"
              >
                <Upload className="h-4 w-4" />
              </button>
              <input
                ref={chatFileRef}
                type="file"
                className="hidden"
                accept=".csv,.xlsx,.xls,.txt"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleChatFile(f); e.target.value = ""; }}
              />
              <input
                className="flex-1 h-9 rounded-lg border border-input bg-background px-3 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Post financial data or ask a budget question…"
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

                {/* Column headers change based on detected data type */}
                {(() => {
                  const cols: string[] = proposedDataType === "revenue"
                    ? ["Source","Category","Budgeted Amount","Collected Amount","Year"]
                    : proposedDataType === "projects"
                    ? ["Name","Department","Total Budget","Spent To Date","Percent Complete","Status","Year"]
                    : ["Department","Category","Budgeted Amount","Spent Amount","Year"];
                  const optionalFields = ["Spent Amount","Collected Amount","Spent To Date","Percent Complete"];
                  return (
                    <div className="overflow-x-auto rounded-lg border text-xs">
                      <table className="w-full">
                        <thead className="bg-muted">
                          <tr>
                            {cols.map(h => (
                              <th key={h} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                            ))}
                            <th className="px-2 py-1.5 w-6" />
                          </tr>
                        </thead>
                        <tbody>
                          {proposedRows.map((row, i) => (
                            <tr key={i} className="border-t hover:bg-muted/30">
                              {cols.map(field => {
                                const val = (row as any)[field] ?? "";
                                // Determine if this field should be a dropdown
                                const deptOpts   = foByType("department");
                                const srcOpts    = foByType("source");
                                const dCatOpts   = foByType("dept_category");
                                const rCatOpts   = foByType("rev_category");
                                const dropdownOpts: string[] | null =
                                  field === "Department"   ? deptOpts :
                                  field === "Source"       ? srcOpts :
                                  field === "Category"     ? (proposedDataType === "revenue" ? rCatOpts : dCatOpts) :
                                  field === "Status"       ? ["on-track", "at-risk", "behind"] :
                                  field === "Year"         ? [...SELECTABLE_YEARS] :
                                  null;
                                return (
                                  <td key={field} className="px-1 py-1">
                                    {dropdownOpts && dropdownOpts.length > 0 ? (
                                      <select
                                        className="w-full bg-transparent px-1.5 py-0.5 rounded border border-transparent hover:border-input focus:border-input focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-xs"
                                        value={val}
                                        onChange={e => updateRow(i, field, e.target.value)}
                                        data-testid={`row-${i}-${field.replace(/ /g,"-")}`}
                                      >
                                        {val === "" && <option value="">— select —</option>}
                                        {dropdownOpts.map(opt => (
                                          <option key={opt} value={opt}>{opt}</option>
                                        ))}
                                      </select>
                                    ) : (
                                      <input
                                        className="w-full bg-transparent px-1.5 py-0.5 rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-xs"
                                        value={val}
                                        onChange={e => updateRow(i, field, e.target.value)}
                                        placeholder={optionalFields.includes(field) ? "optional" : ""}
                                        data-testid={`row-${i}-${field.replace(/ /g,"-")}`}
                                      />
                                    )}
                                  </td>
                                );
                              })}
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
                  );
                })()}
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
                <label className="text-xs font-medium mb-1.5 block text-muted-foreground uppercase tracking-wide">Year</label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={uploadYear}
                  onChange={e => setUploadYear(e.target.value)}
                  data-testid="select-upload-year"
                >
                  {SELECTABLE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
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
              <div className="flex justify-between"><span className="text-muted-foreground">Year</span><span className="font-medium">{uploadYear}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Rows to import</span><span className="font-medium">{preview.totalRows}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Columns mapped</span><span className="font-medium">{Object.keys(columnMap).length} / {REQUIRED_COLS[uploadType].length}</span></div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Import mode</span>
                <div className="flex gap-1 p-0.5 bg-muted rounded-md">
                  <button
                    onClick={() => setImportMode("append")}
                    className={`text-xs py-1 px-2.5 rounded font-medium transition-colors ${importMode === "append" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    data-testid="btn-mode-append"
                  >Append</button>
                  <button
                    onClick={() => setImportMode("overwrite")}
                    className={`text-xs py-1 px-2.5 rounded font-medium transition-colors ${importMode === "overwrite" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    data-testid="btn-mode-overwrite"
                  >Overwrite</button>
                </div>
              </div>
            </div>
            <div className={`rounded-md p-3 text-xs ${importMode === "overwrite" ? "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300" : "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300"}`}>
              {importMode === "overwrite"
                ? `This will replace all existing ${TYPE_LABELS[uploadType]} data for ${uploadYear}. This cannot be undone.`
                : `New records will be added to existing ${TYPE_LABELS[uploadType]} data for ${uploadYear}.`}
            </div>
            <Button onClick={handleImport} disabled={isUploading} className="w-full" data-testid="btn-import">
              <Upload className="h-4 w-4 mr-2" />
              {isUploading ? "Importing…" : `${importMode === "overwrite" ? "Replace &" : ""} Import ${preview.totalRows} Records`}
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

// ─── PDF Report Download ────────────────────────────────────────────────────
const REPORT_VIEWS = [
  { value: "overview",   label: "Overview" },
  { value: "revenue",    label: "Revenue" },
  { value: "spending",   label: "Spending" },
  { value: "comparison", label: "Comparison" },
  { value: "projects",   label: "Projects" },
];

function formatCurrency(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

function formatPct(val: number): string { return `${val.toFixed(1)}%`; }

async function generateBudgetPdf(params: {
  slug: string;
  token: string | null;
  muniName: string;
  years: string[];
  views: string[];
}) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const { slug, token, muniName, years, views } = params;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  (doc as any).setProperties({ title: `${muniName} Budget Report`, author: "Perplexity Computer" });

  // ── Design constants ──────────────────────────────────────────────────────
  const PAGE_W = 612;
  const PAGE_H = 792;
  const MARGIN = 40;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  const TEAL = [1, 105, 111] as [number, number, number];
  const TEAL_LIGHT = [219, 242, 244] as [number, number, number];
  const DARK = [40, 37, 29] as [number, number, number];
  const MUTED = [122, 121, 116] as [number, number, number];
  const BORDER = [212, 209, 202] as [number, number, number];
  const WHITE = [255, 255, 255] as [number, number, number];

  let firstPage = true;

  // ── Cover page ────────────────────────────────────────────────────────────
  doc.setFillColor(...TEAL);
  doc.rect(0, 0, PAGE_W, 180, "F");
  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.text(muniName, MARGIN, 85);
  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  doc.text("Budget Transparency Report", MARGIN, 110);
  doc.setFontSize(11);
  doc.text(`Years: ${years.join(", ")}  ·  Generated ${new Date().toLocaleDateString()}`, MARGIN, 135);
  doc.text(`Sections: ${views.map(v => REPORT_VIEWS.find(r => r.value === v)?.label ?? v).join(", ")}`, MARGIN, 155);
  doc.setTextColor(...DARK);
  doc.setFontSize(9);
  doc.text("Generated by Civic.Finance · Powered by Perplexity Computer", MARGIN, PAGE_H - 25);

  // ── Helper: page header ───────────────────────────────────────────────────
  function pageHeader(title: string, year: string) {
    doc.setFillColor(...TEAL);
    doc.rect(0, 0, PAGE_W, 38, "F");
    doc.setTextColor(...WHITE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(muniName, MARGIN, 24);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(title, PAGE_W / 2, 24, { align: "center" });
    doc.text(year, PAGE_W - MARGIN, 24, { align: "right" });
    doc.setTextColor(...DARK);
  }

  // ── Helper: page footer ───────────────────────────────────────────────────
  function pageFooter(pageNum: number) {
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.text(`Page ${pageNum}`, PAGE_W - MARGIN, PAGE_H - 18, { align: "right" });
    doc.text("Civic.Finance Budget Transparency Report", MARGIN, PAGE_H - 18);
    doc.setTextColor(...DARK);
  }

  // ── Helper: section heading ───────────────────────────────────────────────
  function sectionHeading(text: string, y: number): number {
    doc.setFillColor(...TEAL_LIGHT);
    doc.roundedRect(MARGIN, y, CONTENT_W, 22, 3, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...TEAL);
    doc.text(text, MARGIN + 10, y + 15);
    doc.setTextColor(...DARK);
    return y + 32;
  }

  // ── Helper: KPI row ───────────────────────────────────────────────────────
  function kpiRow(items: { label: string; value: string; sub?: string }[], y: number): number {
    const cellW = CONTENT_W / items.length;
    items.forEach((item, i) => {
      const x = MARGIN + i * cellW;
      doc.setFillColor(...WHITE);
      doc.setDrawColor(...BORDER);
      doc.roundedRect(x + 2, y, cellW - 4, 56, 4, 4, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(...TEAL);
      doc.text(item.value, x + cellW / 2, y + 28, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text(item.label, x + cellW / 2, y + 41, { align: "center" });
      if (item.sub) {
        doc.setFontSize(7);
        doc.text(item.sub, x + cellW / 2, y + 52, { align: "center" });
      }
    });
    doc.setTextColor(...DARK);
    return y + 66;
  }

  let pageNum = 1;

  // ── Iterate years × views ─────────────────────────────────────────────────
  for (const year of years) {
    // fetch all data needed for this year up front
    const [summary, depts, revenues, projects] = await Promise.all([
      fetch(`/api/summary/${year}?tenant=${slug}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(r => r.ok ? r.json() : null),
      fetch(`/api/departments/${year}?tenant=${slug}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(r => r.ok ? r.json() : []),
      fetch(`/api/revenue/${year}?tenant=${slug}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(r => r.ok ? r.json() : []),
      views.includes("projects") ? fetch(`/api/projects?tenant=${slug}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(r => r.ok ? r.json() : []) : Promise.resolve([]),
    ]);

    for (const view of views) {
      if (!firstPage) { doc.addPage(); pageNum++; }
      firstPage = false;

      const viewLabel = REPORT_VIEWS.find(v => v.value === view)?.label ?? view;
      pageHeader(viewLabel, year);
      pageFooter(pageNum);
      let y = 55;

      // ──── OVERVIEW ────────────────────────────────────────────────────────
      if (view === "overview" && summary) {
        y = sectionHeading(`Overview — ${year}`, y);
        y = kpiRow([
          { label: "Total Budget",     value: formatCurrency(summary.totalBudget) },
          { label: "Total Spent",      value: formatCurrency(summary.totalSpent) },
          { label: "% Spent",          value: formatPct(summary.percentSpent) },
          { label: "Budget Reserve",   value: formatPct(summary.budgetReserve) },
        ], y);
        y = kpiRow([
          { label: "Revenue Budgeted",  value: formatCurrency(summary.totalRevenueBudgeted) },
          { label: "Revenue Collected", value: formatCurrency(summary.totalRevenueCollected) },
          { label: "Revenue Efficiency",value: formatPct(summary.revenueEfficiency) },
          { label: "Cost / Resident",  value: summary.costPerResident > 0 ? formatCurrency(summary.costPerResident) : "N/A", sub: summary.population ? `Pop. ${summary.population.toLocaleString()}` : undefined },
        ], y);
        if (summary.yoyChange !== 0) {
          y += 6;
          doc.setFontSize(9);
          doc.setTextColor(...MUTED);
          const dir = summary.yoyChange > 0 ? "▲" : "▼";
          doc.text(`${dir} Year-over-year budget change: ${formatPct(Math.abs(summary.yoyChange))}`, MARGIN, y);
          doc.setTextColor(...DARK);
          y += 14;
        }
        y += 4;
        y = sectionHeading("Department Breakdown", y);
        const deptRows = (summary.departments || []).map((d: any) => [
          d.name,
          formatCurrency(d.budgeted),
          formatCurrency(d.spent),
          d.budgeted > 0 ? formatPct((d.spent / d.budgeted) * 100) : "—",
        ]);
        autoTable(doc, {
          startY: y,
          margin: { left: MARGIN, right: MARGIN },
          head: [["Department", "Budgeted", "Spent", "% Spent"]],
          body: deptRows,
          styles: { fontSize: 9, cellPadding: 5, textColor: DARK as any },
          headStyles: { fillColor: TEAL as any, textColor: WHITE as any, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [249, 248, 245] as any },
          columnStyles: { 0: { cellWidth: 200 }, 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
        });
      }

      // ──── REVENUE ─────────────────────────────────────────────────────────
      else if (view === "revenue") {
        y = sectionHeading(`Revenue — ${year}`, y);
        if (summary) {
          y = kpiRow([
            { label: "Revenue Budgeted",  value: formatCurrency(summary.totalRevenueBudgeted) },
            { label: "Revenue Collected", value: formatCurrency(summary.totalRevenueCollected) },
            { label: "Efficiency",        value: formatPct(summary.revenueEfficiency) },
          ], y);
          y += 4;
        }
        const revRows = revenues.map((r: any) => [
          r.source ?? "—",
          r.category ?? "—",
          formatCurrency(r.budgetedAmount ?? 0),
          formatCurrency(r.collectedAmount ?? 0),
          (r.budgetedAmount ?? 0) > 0 ? formatPct(((r.collectedAmount ?? 0) / r.budgetedAmount) * 100) : "—",
        ]);
        autoTable(doc, {
          startY: y,
          margin: { left: MARGIN, right: MARGIN },
          head: [["Source", "Category", "Budgeted", "Collected", "% Collected"]],
          body: revRows.length ? revRows : [["No data", "", "", "", ""]],
          styles: { fontSize: 9, cellPadding: 5, textColor: DARK as any },
          headStyles: { fillColor: TEAL as any, textColor: WHITE as any, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [249, 248, 245] as any },
          columnStyles: { 0: { cellWidth: 140 }, 1: { cellWidth: 110 }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
        });
      }

      // ──── SPENDING ────────────────────────────────────────────────────────
      else if (view === "spending") {
        y = sectionHeading(`Spending — ${year}`, y);
        if (summary) {
          y = kpiRow([
            { label: "Total Budget", value: formatCurrency(summary.totalBudget) },
            { label: "Total Spent",  value: formatCurrency(summary.totalSpent) },
            { label: "% Spent",      value: formatPct(summary.percentSpent) },
          ], y);
          y += 4;
        }
        // group by dept
        const deptMap: Record<string, { budgeted: number; spent: number; categories: Record<string, { budgeted: number; spent: number }> }> = {};
        for (const d of depts) {
          if (!deptMap[d.department]) deptMap[d.department] = { budgeted: 0, spent: 0, categories: {} };
          deptMap[d.department].budgeted += d.budgetedAmount ?? 0;
          deptMap[d.department].spent += d.spentAmount ?? 0;
          const cat = d.category ?? "General";
          if (!deptMap[d.department].categories[cat]) deptMap[d.department].categories[cat] = { budgeted: 0, spent: 0 };
          deptMap[d.department].categories[cat].budgeted += d.budgetedAmount ?? 0;
          deptMap[d.department].categories[cat].spent += d.spentAmount ?? 0;
        }
        const spendRows = Object.entries(deptMap)
          .sort((a, b) => b[1].budgeted - a[1].budgeted)
          .map(([dept, vals]) => [
            dept,
            Object.keys(vals.categories).join(", "),
            formatCurrency(vals.budgeted),
            formatCurrency(vals.spent),
            vals.budgeted > 0 ? formatPct((vals.spent / vals.budgeted) * 100) : "—",
          ]);
        autoTable(doc, {
          startY: y,
          margin: { left: MARGIN, right: MARGIN },
          head: [["Department", "Categories", "Budgeted", "Spent", "% Spent"]],
          body: spendRows.length ? spendRows : [["No data", "", "", "", ""]],
          styles: { fontSize: 9, cellPadding: 5, textColor: DARK as any },
          headStyles: { fillColor: TEAL as any, textColor: WHITE as any, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [249, 248, 245] as any },
          columnStyles: { 0: { cellWidth: 130 }, 1: { cellWidth: 120 }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
        });
      }

      // ──── COMPARISON (year-over-year) ─────────────────────────────────────
      else if (view === "comparison") {
        y = sectionHeading(`Year Comparison — ${year}`, y);
        // fetch prior year data
        const allYears: string[] = await fetch(`/api/years?tenant=${slug}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(r => r.ok ? r.json() : []);
        const yearIdx = allYears.indexOf(year);
        const priorYear = yearIdx < allYears.length - 1 ? allYears[yearIdx + 1] : null;
        if (priorYear && summary) {
          const priorSummary = await fetch(`/api/summary/${priorYear}?tenant=${slug}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(r => r.ok ? r.json() : null);
          if (priorSummary) {
            autoTable(doc, {
              startY: y,
              margin: { left: MARGIN, right: MARGIN },
              head: [["Metric", priorYear, year, "Change"]],
              body: [
                ["Total Budget",           formatCurrency(priorSummary.totalBudget),           formatCurrency(summary.totalBudget),           formatPct(summary.yoyChange)],
                ["Total Spent",            formatCurrency(priorSummary.totalSpent),            formatCurrency(summary.totalSpent),            summary.totalBudget > 0 ? formatPct(((summary.totalSpent - priorSummary.totalSpent) / (priorSummary.totalSpent || 1)) * 100) : "—"],
                ["Revenue Budgeted",       formatCurrency(priorSummary.totalRevenueBudgeted),  formatCurrency(summary.totalRevenueBudgeted),  priorSummary.totalRevenueBudgeted > 0 ? formatPct(((summary.totalRevenueBudgeted - priorSummary.totalRevenueBudgeted) / priorSummary.totalRevenueBudgeted) * 100) : "—"],
                ["Revenue Collected",      formatCurrency(priorSummary.totalRevenueCollected), formatCurrency(summary.totalRevenueCollected), priorSummary.totalRevenueCollected > 0 ? formatPct(((summary.totalRevenueCollected - priorSummary.totalRevenueCollected) / priorSummary.totalRevenueCollected) * 100) : "—"],
                ["Revenue Efficiency",     formatPct(priorSummary.revenueEfficiency),          formatPct(summary.revenueEfficiency),          "—"],
                ["% Spent",                formatPct(priorSummary.percentSpent),               formatPct(summary.percentSpent),               "—"],
                ["Cost / Resident",        priorSummary.costPerResident > 0 ? formatCurrency(priorSummary.costPerResident) : "N/A",  summary.costPerResident > 0 ? formatCurrency(summary.costPerResident) : "N/A",  "—"],
              ],
              styles: { fontSize: 9, cellPadding: 6, textColor: DARK as any },
              headStyles: { fillColor: TEAL as any, textColor: WHITE as any, fontStyle: "bold" },
              alternateRowStyles: { fillColor: [249, 248, 245] as any },
              columnStyles: { 0: { cellWidth: 180 }, 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
            });
            // dept comparison
            const priorDeptMap: Record<string, { budgeted: number; spent: number }> = {};
            for (const d of (priorSummary.departments || [])) priorDeptMap[d.name] = { budgeted: d.budgeted, spent: d.spent };
            const compRows = (summary.departments || []).map((d: any) => {
              const prior = priorDeptMap[d.name];
              const change = prior && prior.budgeted > 0 ? formatPct(((d.budgeted - prior.budgeted) / prior.budgeted) * 100) : "New";
              return [d.name, prior ? formatCurrency(prior.budgeted) : "—", formatCurrency(d.budgeted), change];
            });
            if (compRows.length) {
              const afterY = (doc as any).lastAutoTable?.finalY ?? y + 20;
              autoTable(doc, {
                startY: afterY + 16,
                margin: { left: MARGIN, right: MARGIN },
                head: [["Department", `Budget ${priorYear}`, `Budget ${year}`, "Change"]],
                body: compRows,
                styles: { fontSize: 9, cellPadding: 5, textColor: DARK as any },
                headStyles: { fillColor: [30, 71, 77] as any, textColor: WHITE as any, fontStyle: "bold" },
                alternateRowStyles: { fillColor: [249, 248, 245] as any },
                columnStyles: { 0: { cellWidth: 200 }, 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
              });
            }
          }
        } else {
          doc.setFontSize(10);
          doc.setTextColor(...MUTED);
          doc.text(priorYear ? "Could not load prior year data." : "No prior year data available for comparison.", MARGIN, y + 20);
          doc.setTextColor(...DARK);
        }
      }

      // ──── PROJECTS ────────────────────────────────────────────────────────
      else if (view === "projects") {
        y = sectionHeading("Capital Projects", y);
        const projRows = projects.map((p: any) => [
          p.name ?? "—",
          p.department ?? "—",
          p.status ?? "—",
          p.totalCost != null ? formatCurrency(p.totalCost) : "—",
          p.amountSpent != null ? formatCurrency(p.amountSpent) : "—",
          p.completionDate ?? "—",
        ]);
        autoTable(doc, {
          startY: y,
          margin: { left: MARGIN, right: MARGIN },
          head: [["Project", "Department", "Status", "Total Cost", "Spent", "Est. Completion"]],
          body: projRows.length ? projRows : [["No capital projects found.", "", "", "", "", ""]],
          styles: { fontSize: 8.5, cellPadding: 5, textColor: DARK as any },
          headStyles: { fillColor: TEAL as any, textColor: WHITE as any, fontStyle: "bold" },
          alternateRowStyles: { fillColor: [249, 248, 245] as any },
          columnStyles: { 0: { cellWidth: 145 }, 3: { halign: "right" }, 4: { halign: "right" } },
        });
      }
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const safeSlug = slug.replace(/[^a-z0-9-]/gi, "_");
  const yearStr = years.join("-");
  doc.save(`${safeSlug}_budget_report_${yearStr}.pdf`);
}

function ReportDownloadPanel({ token, slug }: { token: string | null; slug: string }) {
  const { toast } = useToast();
  const { data: muni } = useMunicipality();
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedYears, setSelectedYears] = useState<string[]>([]);
  const [selectedViews, setSelectedViews] = useState<string[]>(["overview", "revenue", "spending"]);

  const { data: availYears = [] } = useQuery<string[]>({
    queryKey: tKey("/api/years", slug),
    queryFn: () => authFetch(`/api/years?tenant=${slug}`, token).then(r => r.ok ? r.json() : []),
    retry: false,
  });

  const toggleYear = (y: string) =>
    setSelectedYears(prev => prev.includes(y) ? prev.filter(x => x !== y) : [...prev, y]);

  const toggleView = (v: string) =>
    setSelectedViews(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);

  const handleGenerate = async () => {
    if (selectedYears.length === 0) {
      toast({ title: "Select at least one year", variant: "destructive" });
      return;
    }
    if (selectedViews.length === 0) {
      toast({ title: "Select at least one view", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      await generateBudgetPdf({
        slug,
        token,
        muniName: muni?.name ?? slug,
        years: selectedYears.slice().sort(),
        views: selectedViews,
      });
      toast({ title: "PDF downloaded", description: `${selectedYears.length} year(s), ${selectedViews.length} section(s)` });
    } catch (e: any) {
      toast({ title: "PDF generation failed", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="border rounded-xl overflow-hidden" data-testid="card-report-download">
      <button
        className="w-full flex items-center justify-between px-5 py-4 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
        onClick={() => setOpen(o => !o)}
        data-testid="btn-toggle-report-download"
      >
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileDown className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">Download PDF Report</p>
            <p className="text-xs text-muted-foreground">Export budget metrics and visuals as a formatted PDF</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>
      {open && (
        <div className="p-5 border-t space-y-5">
          {/* Year selection */}
          <div>
            <p className="text-sm font-semibold mb-2">Years</p>
            {availYears.length === 0 ? (
              <p className="text-xs text-muted-foreground">No data imported yet.</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {availYears.map(y => (
                  <label key={y} className="flex items-center gap-2 cursor-pointer select-none">
                    <Checkbox
                      id={`rpt-year-${y}`}
                      checked={selectedYears.includes(y)}
                      onCheckedChange={() => toggleYear(y)}
                    />
                    <span className="text-sm tabular-nums">{y}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* View selection */}
          <div>
            <p className="text-sm font-semibold mb-2">Sections to include</p>
            <div className="flex flex-wrap gap-3">
              {REPORT_VIEWS.map(v => (
                <label key={v.value} className="flex items-center gap-2 cursor-pointer select-none">
                  <Checkbox
                    id={`rpt-view-${v.value}`}
                    checked={selectedViews.includes(v.value)}
                    onCheckedChange={() => toggleView(v.value)}
                  />
                  <span className="text-sm">{v.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Download button */}
          <Button
            onClick={handleGenerate}
            disabled={generating || selectedYears.length === 0 || selectedViews.length === 0}
            className="w-full"
            data-testid="btn-download-pdf"
          >
            {generating
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Generating PDF…</>
              : <><FileDown className="h-4 w-4 mr-2" />Download PDF</>}
          </Button>

          {(selectedYears.length === 0 || selectedViews.length === 0) && (
            <p className="text-xs text-muted-foreground text-center">
              {selectedYears.length === 0 ? "Select at least one year" : "Select at least one section"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Subscribers + embed ──────────────────────────────────────────────────────
const EMBED_VIEWS = [
  { value: "overview", label: "Overview" },
  { value: "revenue", label: "Revenue" },
  { value: "spending", label: "Spending" },
  { value: "comparison", label: "Comparison" },
  { value: "projects", label: "Projects" },
];

function EngagementPanel({ token, slug }: { token: string | null; slug: string }) {
  const [showEmbed, setShowEmbed] = useState(false);
  const [embedView, setEmbedView] = useState("overview");
  const [embedYear, setEmbedYear] = useState("");
  const [embedTheme, setEmbedTheme] = useState("");
  const [copied, setCopied] = useState(false);
  const { data: subs = [] } = useQuery<EmailSubscriber[]>({
    queryKey: tKey("/api/subscribers", slug),
    queryFn: () => authFetch(`/api/subscribers?tenant=${slug}`, token).then(r => r.ok ? r.json() : []),
    retry: false,
  });
  const { data: availYears = [] } = useQuery<string[]>({
    queryKey: tKey("/api/years", slug),
    queryFn: () => authFetch(`/api/years?tenant=${slug}`, token).then(r => r.ok ? r.json() : []),
    retry: false,
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const embedParams = [`tenant=${slug}`, "embed=1", `view=${embedView}`];
  if (embedYear) embedParams.push(`year=${embedYear}`);
  if (embedTheme) embedParams.push(`theme=${embedTheme}`);
  const embedSrc = `${origin}/?${embedParams.join("&")}`;
  const embedCode = `<iframe
  src="${embedSrc}"
  width="100%" height="700"
  style="border:none;border-radius:8px;"
  title="Civic.Finance Dashboard"
></iframe>
<script>
window.addEventListener("message", function(e) {
  if (e.data && e.data.type === "civic-finance-resize") {
    var f = document.querySelector('iframe[src*="tenant=${slug}"]');
    if (f) f.style.height = e.data.height + "px";
  }
});
</script>`;

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
          <div className="flex-1">
            <p className="text-sm font-semibold">{subs.length} email subscriber{subs.length !== 1 ? "s" : ""}</p>
            <p className="text-xs text-muted-foreground">Residents opted in to budget update notifications</p>
          </div>
          {subs.filter(s => s.active).length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs shrink-0"
              data-testid="btn-export-subscribers"
              onClick={() => {
                const active = subs.filter(s => s.active);
                const csv = "email,subscribed_at\n" + active.map(s => `${s.email},${s.subscribedAt}`).join("\n");
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = `subscribers_${slug}.csv`; a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="h-3 w-3 mr-1" />Export CSV
            </Button>
          )}
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
            <div className="mt-3 space-y-3">
              <p className="text-xs text-muted-foreground">Configure the embed, then copy the snippet into your town website. The iframe auto-resizes to fit its content.</p>
              {/* Embed config controls */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">View</label>
                  <select
                    className="w-full h-8 rounded-md border bg-background px-2 text-xs"
                    value={embedView}
                    onChange={e => setEmbedView(e.target.value)}
                    data-testid="select-embed-view"
                  >
                    {EMBED_VIEWS.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Year</label>
                  <select
                    className="w-full h-8 rounded-md border bg-background px-2 text-xs"
                    value={embedYear}
                    onChange={e => setEmbedYear(e.target.value)}
                    data-testid="select-embed-year"
                  >
                    <option value="">Latest</option>
                    {availYears.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Theme</label>
                  <select
                    className="w-full h-8 rounded-md border bg-background px-2 text-xs"
                    value={embedTheme}
                    onChange={e => setEmbedTheme(e.target.value)}
                    data-testid="select-embed-theme"
                  >
                    <option value="">Auto</option>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </div>
              </div>
              <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all select-all border">{embedCode}</pre>
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs"
                data-testid="btn-copy-embed"
                onClick={() => {
                  navigator.clipboard?.writeText(embedCode);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? <><CheckCircle2 className="h-3 w-3 mr-1" />Copied</> : <>Copy embed code</>}
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
// ── Year Management Panel ──────────────────────────────────────────────────────────
function YearManagementPanel({ token, slug }: { token: string | null; slug: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [confirmYear, setConfirmYear] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: years = [], isLoading } = useQuery<string[]>({
    queryKey: tKey("/api/years", slug),
    queryFn: () => authFetch(`/api/years?tenant=${slug}`, token).then(r => r.ok ? r.json() : []),
    retry: false,
  });

  const handleDelete = async () => {
    if (!confirmYear) return;
    setDeleting(true);
    try {
      const r = await authFetch(`/api/years/${confirmYear}?tenant=${slug}`, token, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error ?? "Delete failed");
      const { departments, revenue } = await r.json();
      toast({ title: `Year ${confirmYear} deleted`, description: `Removed ${departments} dept + ${revenue} revenue records.` });
      qc.invalidateQueries({ queryKey: tKey("/api/years", slug) });
      qc.invalidateQueries({ queryKey: tKey("/api/summary", slug) });
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    } finally {
      setDeleting(false);
      setConfirmYear(null);
    }
  };

  return (
    <>
      <div className="border rounded-xl overflow-hidden" data-testid="card-year-management">
        <button
          className="w-full flex items-center justify-between px-5 py-4 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
          onClick={() => setOpen(o => !o)}
          data-testid="btn-toggle-year-management"
        >
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Calendar className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Year Management</p>
              <p className="text-xs text-muted-foreground">Delete removes all department and revenue records for that year</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {years.length > 0 && <Badge variant="outline" className="text-xs">{years.length} year{years.length !== 1 ? "s" : ""}</Badge>}
            {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </button>
        {open && (
          <div className="p-5 border-t">
            {isLoading ? (
              <p className="text-sm text-muted-foreground"><Loader2 className="inline h-3.5 w-3.5 animate-spin mr-1.5" />Loading…</p>
            ) : years.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data imported yet.</p>
            ) : (
              <div className="space-y-1.5">
                {years.map(y => (
                  <div key={y} className="flex items-center justify-between p-2.5 rounded-md border bg-muted/20" data-testid={`year-row-${y}`}>
                    <span className="text-sm font-medium tabular-nums">{y}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setConfirmYear(y)}
                      data-testid={`btn-delete-year-${y}`}
                    >
                      <Minus className="h-3.5 w-3.5 mr-1" />Delete year
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <AlertDialog open={!!confirmYear} onOpenChange={open => { if (!open) setConfirmYear(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all data for {confirmYear}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes all department budget and revenue records imported for <strong>{confirmYear}</strong>.
              This cannot be undone. Capital projects are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleting}
              data-testid="btn-confirm-delete-year"
            >
              {deleting ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Deleting…</> : "Delete year"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Population Panel (year-tagged figures) ─────────────────────────────────────────
function PopulationPanel({ token, slug }: { token: string | null; slug: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const { data: figures = [] } = useQuery<PopulationFigure[]>({
    queryKey: tKey("/api/population", slug),
    queryFn: () => authFetch(`/api/population?tenant=${slug}`, token).then(r => r.ok ? r.json() : []),
  });
  const [addYear, setAddYear] = useState("");
  const [addPop, setAddPop] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const yr = normalizeYear(addYear);
    const pop = parseInt(addPop.replace(/[^\d]/g, ""), 10);
    if (!yr || yr.length !== 4) { toast({ title: "Enter a valid 4-digit year", variant: "destructive" }); return; }
    if (isNaN(pop) || pop <= 0) { toast({ title: "Enter a valid population", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const r = await authFetch(`/api/population?tenant=${slug}`, token, {
        method: "POST",
        body: JSON.stringify({ year: yr, population: pop }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Save failed");
      toast({ title: `Population for ${yr} saved` });
      qc.invalidateQueries({ queryKey: tKey("/api/population", slug) });
      qc.invalidateQueries({ queryKey: tKey("/api/summary", slug) });
      qc.invalidateQueries({ queryKey: tKey("/api/municipality", slug) });
      setAddYear(""); setAddPop("");
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const remove = async (id: number) => {
    try {
      await authFetch(`/api/population/${id}?tenant=${slug}`, token, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: tKey("/api/population", slug) });
      qc.invalidateQueries({ queryKey: tKey("/api/summary", slug) });
      qc.invalidateQueries({ queryKey: tKey("/api/municipality", slug) });
    } catch {}
  };

  return (
    <div className="border rounded-xl overflow-hidden" data-testid="card-population">
      <button
        className="w-full flex items-center justify-between px-5 py-4 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
        onClick={() => setOpen(o => !o)}
        data-testid="btn-toggle-population"
      >
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">Population</p>
            <p className="text-xs text-muted-foreground">One figure per year — Overview uses the matching year or latest available</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {figures.length > 0 && <Badge variant="outline" className="text-xs">{figures.length} year{figures.length !== 1 ? "s" : ""}</Badge>}
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>
      {open && (
        <div className="p-5 border-t space-y-3">
          {/* Existing entries */}
          {figures.length > 0 && (
            <div className="divide-y rounded-lg border text-sm">
              {figures.map(f => (
                <div key={f.id} className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs tabular-nums">{f.year}</Badge>
                    <span className="tabular-nums">{f.population.toLocaleString()}</span>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => remove(f.id)} data-testid={`btn-del-pop-${f.id}`}>
                    <Trash2 className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          {/* Add new */}
          <div className="flex items-center gap-2">
            <select
              className="h-8 w-24 rounded-md border bg-background px-2 text-sm"
              value={addYear}
              onChange={e => setAddYear(e.target.value)}
              data-testid="select-pop-year"
            >
              <option value="">Year</option>
              {SELECTABLE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <Input
              type="number"
              min={1}
              placeholder="Population"
              className="h-8 w-36 text-sm"
              value={addPop}
              onChange={e => setAddPop(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") save(); }}
              data-testid="input-population"
            />
            <Button size="sm" className="h-8" onClick={save} disabled={saving} data-testid="btn-save-population">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Plus className="h-3.5 w-3.5 mr-1" />Add</>}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Import History Panel (with expandable batch records) ─────────────────────
function BatchRecordDetail({ batchId, token, slug }: { batchId: number; token: string | null; slug: string }) {
  const { data: records = [], isLoading } = useQuery<{ id: number; data: Record<string, unknown> }[]>({
    queryKey: tKey(`/api/uploads/${batchId}/records`, slug),
    queryFn: () => authFetch(`/api/uploads/${batchId}/records?tenant=${slug}`, token).then(r => r.ok ? r.json() : []),
    retry: false,
  });

  if (isLoading) return <p className="text-xs text-muted-foreground px-4 pb-3"><Loader2 className="inline h-3 w-3 animate-spin mr-1" />Loading records…</p>;
  if (records.length === 0) return <p className="text-xs text-muted-foreground px-4 pb-3 italic">No record detail stored for this batch (imported before history detail was enabled).</p>;

  const headers = Object.keys(records[0].data);
  return (
    <div className="px-3 pb-3 overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            {headers.map(h => (
              <th key={h} className="text-left py-1 px-2 text-muted-foreground font-medium border-b whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map(r => (
            <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20">
              {headers.map(h => (
                <td key={h} className="py-1 px-2 tabular-nums">
                  {typeof r.data[h] === "number"
                    ? Number.isInteger(r.data[h]) ? String(r.data[h]) : (r.data[h] as number).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : String(r.data[h] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Field Options Panel ────────────────────────────────────────────────────

const FO_TABS: { key: string; label: string; type: string }[] = [
  { key: "department",    label: "Departments",     type: "department" },
  { key: "source",        label: "Revenue Sources", type: "source" },
  { key: "dept_category", label: "Dept Categories", type: "dept_category" },
  { key: "rev_category",  label: "Rev Categories",  type: "rev_category" },
];

function FieldOptionsTab({ token, slug, fieldType }: { token: string | null; slug: string; fieldType: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [newValue, setNewValue] = useState("");

  const { data: options = [], isLoading } = useQuery<FieldOption[]>({
    queryKey: tKey(`/api/field-options?type=${fieldType}`, slug),
    queryFn: () => authFetch(`/api/field-options?type=${fieldType}&tenant=${slug}`, token).then(r => r.ok ? r.json() : []),
    retry: false,
  });

  const addMutation = useMutation({
    mutationFn: (value: string) =>
      authFetch(`/api/field-options?tenant=${slug}`, token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldType, value }),
      }).then(r => r.ok ? r.json() : r.json().then((e: any) => Promise.reject(e.error))),
    onSuccess: () => {
      setNewValue("");
      qc.invalidateQueries({ queryKey: tKey(`/api/field-options?type=${fieldType}`, slug) });
      toast({ title: "Option added" });
    },
    onError: (e: any) => toast({ title: "Error", description: String(e), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      authFetch(`/api/field-options/${id}?tenant=${slug}`, token, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tKey(`/api/field-options?type=${fieldType}`, slug) });
      toast({ title: "Option removed" });
    },
    onError: () => toast({ title: "Error deleting option", variant: "destructive" }),
  });

  const systemOpts = options.filter(o => o.isSystem);
  const customOpts = options.filter(o => !o.isSystem);

  return (
    <div className="space-y-3">
      {/* System defaults — read-only chips */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1.5">System defaults (read-only)</p>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {systemOpts.map(o => (
              <span key={o.id} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground border">{o.value}</span>
            ))}
          </div>
        )}
      </div>

      {/* Custom options */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1.5">Custom options (municipality-specific)</p>
        {customOpts.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No custom options yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {customOpts.map(o => (
              <span key={o.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary border border-primary/20">
                {o.value}
                <button
                  className="ml-0.5 hover:text-destructive transition-colors"
                  onClick={() => deleteMutation.mutate(o.id)}
                  data-testid={`btn-delete-fo-${o.id}`}
                  title="Remove"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Add custom option */}
      <div className="flex gap-2">
        <Input
          className="h-8 text-sm"
          placeholder="Add custom value…"
          value={newValue}
          onChange={e => setNewValue(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && newValue.trim()) addMutation.mutate(newValue.trim()); }}
          data-testid={`input-fo-new-${fieldType}`}
        />
        <Button
          size="sm"
          className="h-8 px-3"
          disabled={!newValue.trim() || addMutation.isPending}
          onClick={() => addMutation.mutate(newValue.trim())}
          data-testid={`btn-fo-add-${fieldType}`}
        >
          {addMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

function FieldOptionsPanel({ token, slug }: { token: string | null; slug: string }) {
  const [activeTab, setActiveTab] = useState("department");
  return (
    <Card data-testid="card-field-options">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Tag className="h-4 w-4" />Controlled Field Options
        </CardTitle>
        <CardDescription>Manage allowed values for Department, Revenue Source, and Category fields. System defaults are seeded automatically; add municipality-specific options below.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-8 mb-4">
            {FO_TABS.map(t => (
              <TabsTrigger key={t.key} value={t.key} className="text-xs h-7 px-3">{t.label}</TabsTrigger>
            ))}
          </TabsList>
          {FO_TABS.map(t => (
            <TabsContent key={t.key} value={t.key}>
              <FieldOptionsTab token={token} slug={slug} fieldType={t.type} />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

function UploadHistoryPanel({ token, slug }: { token: string | null; slug: string }) {
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;
  const { data: uploads = [] } = useQuery<UploadHistory[]>({
    queryKey: tKey("/api/uploads", slug),
    queryFn: () => authFetch(`/api/uploads?tenant=${slug}`, token).then(r => r.ok ? r.json() : []),
    retry: false,
  });

  if (!uploads.length) return null;

  const totalPages = Math.ceil(uploads.length / PAGE_SIZE);
  const pageUploads = uploads.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="border rounded-xl overflow-hidden" data-testid="card-import-history">
      <button
        className="w-full flex items-center justify-between px-5 py-4 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
        onClick={() => setOpen(o => !o)}
        data-testid="btn-toggle-import-history"
      >
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">Import History</p>
            <p className="text-xs text-muted-foreground">Click a batch to see the imported records</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{uploads.length} batch{uploads.length !== 1 ? "es" : ""}</Badge>
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>
      {open && (
      <div className="border-t">
        <div className="divide-y">
          {pageUploads.map(u => (
            <div key={u.id} data-testid={`batch-row-${u.id}`}>
              <button
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/30 transition-colors"
                onClick={() => setExpandedId(expandedId === u.id ? null : u.id)}
              >
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.filename}</p>
                  <p className="text-xs text-muted-foreground">{u.notes}</p>
                  {u.uploadedBy && <p className="text-xs text-muted-foreground/60">by {u.uploadedBy}</p>}
                </div>
                <Badge className={u.status === "success" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : ""} variant={u.status === "success" ? "default" : "destructive"}>
                  {u.status === "success" ? <><CheckCircle2 className="h-3 w-3 mr-1" />{u.recordCount} records</> : <><AlertCircle className="h-3 w-3 mr-1" />Error</>}
                </Badge>
                <span className="text-xs text-muted-foreground tabular-nums shrink-0">{new Date(u.uploadedAt).toLocaleDateString()}</span>
                {expandedId === u.id ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              </button>
              {expandedId === u.id && (
                <div className="border-t bg-muted/10">
                  <BatchRecordDetail batchId={u.id} token={token} slug={slug} />
                </div>
              )}
            </div>
          ))}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-t text-xs text-muted-foreground">
            <span>Page {page + 1} of {totalPages}</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                <ChevronUp className="h-3 w-3 -rotate-90" />Prev
              </Button>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                Next<ChevronDown className="h-3 w-3 -rotate-90" />
              </Button>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
}

// ─── Admin dashboard ──────────────────────────────────────────────────────────
// ── Municipality row with expandable admin accounts ──────────────────────────
function MuniRow({ m, token, onApprove }: { m: any; token: string | null; onApprove?: (id: number, status: string) => void }) {
  const [open, setOpen] = useState(false);
  const { data: admins, isLoading } = useQuery({
    queryKey: ["/api/admin/municipalities", m.id, "admins"],
    queryFn: () =>
      fetch(`${API_BASE}/api/admin/municipalities/${m.id}/admins`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.ok ? r.json() : []),
    enabled: !!token && open,
  });

  const statusColor = m.approvalStatus === "approved"
    ? "text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950 dark:border-emerald-800"
    : m.approvalStatus === "rejected"
    ? "text-destructive bg-destructive/10 border-destructive/20"
    : "text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950 dark:border-amber-800";

  return (
    <div className="border rounded-lg overflow-hidden" data-testid={`card-muni-${m.id}`}>
      <button
        className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{m.name}, {m.state}</p>
            <p className="text-xs text-muted-foreground">
              Pop. {m.population?.toLocaleString() ?? "—"}
              {m.contactEmail ? ` · ${m.contactEmail}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusColor}`}>
            {m.approvalStatus ?? "approved"}
          </span>
          {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="border-t bg-muted/20 px-3 pb-3 pt-2 space-y-3">
          {/* Details row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-muted-foreground">
            <span><span className="font-medium text-foreground">Slug:</span> {m.slug}</span>
            <span><span className="font-medium text-foreground">Listed:</span> {m.listed ? "Yes" : "No"}</span>
            <span><span className="font-medium text-foreground">ID:</span> {m.id}</span>
            {m.website && <span className="col-span-2 sm:col-span-3"><span className="font-medium text-foreground">Website:</span> {m.website}</span>}
          </div>

          {/* Admin accounts */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1.5">
              <UserCircle2 className="h-3.5 w-3.5" /> Admin accounts
            </p>
            {isLoading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : admins && admins.length > 0 ? (
              <div className="space-y-1">
                {admins.map((a: any) => (
                  <div key={a.id} className="flex items-center gap-2 text-xs">
                    <span className="font-mono bg-muted rounded px-1.5 py-0.5">{a.email}</span>
                    <Badge variant="outline" className="text-[10px] py-0 h-4">{a.role}</Badge>
                    {a.createdAt && (
                      <span className="text-muted-foreground flex items-center gap-0.5">
                        <Clock className="h-3 w-3" />
                        {new Date(a.createdAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">No admin accounts</p>
            )}
          </div>

          {/* Pending approval actions */}
          {onApprove && m.approvalStatus === "pending" && (
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="outline" className="h-7 text-xs text-destructive hover:bg-destructive/10"
                onClick={() => onApprove(m.id, "rejected")} data-testid={`btn-reject-${m.id}`}>
                Reject
              </Button>
              <Button size="sm" className="h-7 text-xs"
                onClick={() => onApprove(m.id, "approved")} data-testid={`btn-approve-${m.id}`}>
                Approve
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PlatformAdminPanel({ token }: { token: string | null }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const pending: any[] = useQuery({
    queryKey: ["/api/admin/pending-municipalities"],
    queryFn: () => fetch(`${API_BASE}/api/admin/pending-municipalities`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.ok ? r.json() : []),
    enabled: !!token,
  }).data ?? [];

  const { data: allMunis = [], isLoading: loadingAll } = useQuery({
    queryKey: ["/api/admin/municipalities"],
    queryFn: () => fetch(`${API_BASE}/api/admin/municipalities`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.ok ? r.json() : []),
    enabled: !!token,
  });

  const approve = async (id: number, status: string) => {
    await fetch(`${API_BASE}/api/admin/municipalities/${id}/approval`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status }),
    });
    toast({ title: status === "approved" ? "Municipality approved" : "Municipality rejected" });
    qc.invalidateQueries({ queryKey: ["/api/admin/pending-municipalities"] });
    qc.invalidateQueries({ queryKey: ["/api/admin/municipalities"] });
  };

  return (
    <Card data-testid="card-platform-admin">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Platform Administration
          {pending.length > 0 && (
            <Badge variant="destructive" className="ml-1 text-xs">{pending.length} pending</Badge>
          )}
        </CardTitle>
        <CardDescription>Manage all municipalities and admin accounts on the platform.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={pending.length > 0 ? "pending" : "all"}>
          <TabsList className="mb-4">
            <TabsTrigger value="all" className="gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              All Municipalities
              <Badge variant="secondary" className="text-[10px] py-0 h-4 ml-0.5">{allMunis.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="pending" className="gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Pending Approval
              {pending.length > 0 && (
                <Badge variant="destructive" className="text-[10px] py-0 h-4 ml-0.5">{pending.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-2 mt-0">
            {loadingAll ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading municipalities…
              </div>
            ) : allMunis.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No municipalities yet.</p>
            ) : (
              allMunis.map((m: any) => (
                <MuniRow key={m.id} m={m} token={token} onApprove={approve} />
              ))
            )}
          </TabsContent>

          <TabsContent value="pending" className="space-y-2 mt-0">
            {pending.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                No pending requests — all caught up.
              </div>
            ) : (
              pending.map((m: any) => (
                <MuniRow key={m.id} m={m} token={token} onApprove={approve} />
              ))
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function AdminDashboard() {
  const { logout, getToken, isPlatformAdmin, email: adminEmail } = useAuth();
  const slug = useTenantSlug();
  const token = getToken();
  const { data: muni } = useMunicipality();
  const isplatform = isPlatformAdmin();

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-[900px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            Admin Portal
            {isplatform && <Badge variant="secondary" className="text-xs font-normal gap-1 py-0"><ShieldCheck className="h-3 w-3" />Platform Admin</Badge>}
          </h1>
          {adminEmail && <p className="text-xs text-muted-foreground mt-0.5">{adminEmail}</p>}
          <p className="text-sm text-muted-foreground">{muni?.name}, {muni?.state}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 py-1 text-emerald-600 border-emerald-200 dark:text-emerald-400 dark:border-emerald-800">
            <ShieldCheck className="h-3.5 w-3.5" />Admin
          </Badge>
          <Button variant="ghost" size="sm" onClick={() => logout(isplatform ? undefined : slug)} className="text-muted-foreground" data-testid="btn-logout">
            <LogOut className="h-4 w-4 mr-1.5" />Sign Out
          </Button>
        </div>
      </div>

      {/* Platform admin panel — shown immediately after header */}
      {isplatform && <PlatformAdminPanel token={token} />}

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

      {/* Controlled field options */}
      <FieldOptionsPanel token={token} slug={slug} />

      {/* Import history with expandable batch records */}
      <UploadHistoryPanel token={token} slug={slug} />

      {/* Year management — list + delete by year */}
      <YearManagementPanel token={token} slug={slug} />

      {/* Population — admin-editable, drives Overview cost-per-resident */}
      <PopulationPanel token={token} slug={slug} />

      {/* Comment moderation */}
      <CommentModeration token={token} slug={slug} />

      {/* PDF Report Download */}
      <ReportDownloadPanel token={token} slug={slug} />

      {/* Engagement */}
      <EngagementPanel token={token} slug={slug} />

      {/* (platform panel rendered at top) */}
    </div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────
export default function Admin() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <LoginGate />;
  return <AdminDashboard />;
}
