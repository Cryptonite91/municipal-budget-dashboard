import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import type { UploadHistory } from "@shared/schema";
import { Upload, FileText, CheckCircle2, AlertCircle, Download, Lock, LogOut, ShieldCheck } from "lucide-react";

function LoginGate() {
  const { login, isLoading, error } = useAuth();
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(password);
  };

  return (
    <div className="p-4 md:p-6 max-w-[1000px] mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold">Data Upload</h1>
        <p className="text-sm text-muted-foreground">
          Upload budget data for your municipality. CSV format accepted.
        </p>
      </div>

      <Card className="max-w-md mx-auto" data-testid="card-login">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-base">Admin Access Required</CardTitle>
          <CardDescription>
            Enter the administrator password to access data upload tools.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="admin-password" className="text-sm font-medium mb-1.5 block">
                Password
              </label>
              <Input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter admin password"
                autoFocus
                data-testid="input-admin-password"
              />
              {error && (
                <p className="text-sm text-destructive mt-1.5 flex items-center gap-1" data-testid="text-login-error">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {error}
                </p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={!password.trim() || isLoading}
              data-testid="btn-login"
            >
              {isLoading ? "Verifying..." : "Sign In"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function AdminDashboard() {
  const { toast } = useToast();
  const { logout, getToken } = useAuth();
  const [uploadType, setUploadType] = useState<string>("departments");
  const [uploadYear, setUploadYear] = useState<string>("FY2026");
  const [csvData, setCsvData] = useState<string>("");

  const { data: uploads } = useQuery<UploadHistory[]>({
    queryKey: ["/api/uploads"],
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const token = getToken();
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          data: csvData,
          type: uploadType,
          year: uploadYear,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Upload Successful",
        description: `${data.recordCount} records imported for ${uploadYear}.`,
      });
      setCsvData("");
      queryClient.invalidateQueries({ queryKey: ["/api/uploads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/revenue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/summary"] });
    },
    onError: (err: Error) => {
      toast({
        title: "Upload Failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const deptTemplate = `Department,Category,Budgeted Amount,Spent Amount
Public Safety,Police Department,5200000,4680000
Public Safety,Fire Department,3800000,3420000
Education,K-12 Schools,12500000,11250000`;

  const revenueTemplate = `Source,Category,Budgeted Amount,Collected Amount
Residential Property Tax,Property Taxes,18200000,17890000
Education Fund Grant,State Aid,8400000,8400000
Building Permits & Fees,Fees,1200000,1150000`;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1000px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Data Upload</h1>
          <p className="text-sm text-muted-foreground">
            Upload budget data for your municipality. CSV format accepted.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 py-1 text-emerald-600 border-emerald-200 dark:text-emerald-400 dark:border-emerald-800">
            <ShieldCheck className="h-3.5 w-3.5" />
            Admin
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            className="text-muted-foreground"
            data-testid="btn-logout"
          >
            <LogOut className="h-4 w-4 mr-1.5" />
            Sign Out
          </Button>
        </div>
      </div>

      {/* Upload Form */}
      <Card data-testid="card-upload-form">
        <CardHeader>
          <CardTitle className="text-base">Upload Budget Data</CardTitle>
          <CardDescription>
            Paste CSV data below or prepare a file with the correct column headers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Data Type</label>
              <Select value={uploadType} onValueChange={setUploadType}>
                <SelectTrigger data-testid="select-upload-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="departments">Department Budgets</SelectItem>
                  <SelectItem value="revenue">Revenue Sources</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Fiscal Year</label>
              <Select value={uploadYear} onValueChange={setUploadYear}>
                <SelectTrigger data-testid="select-upload-year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FY2027">FY2027</SelectItem>
                  <SelectItem value="FY2026">FY2026</SelectItem>
                  <SelectItem value="FY2025">FY2025</SelectItem>
                  <SelectItem value="FY2024">FY2024</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">CSV Data</label>
            <Textarea
              placeholder={uploadType === "departments" ? deptTemplate : revenueTemplate}
              value={csvData}
              onChange={(e) => setCsvData(e.target.value)}
              rows={8}
              className="font-mono text-xs"
              data-testid="textarea-csv"
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              {uploadType === "departments"
                ? "Columns: Department, Category, Budgeted Amount, Spent Amount"
                : "Columns: Source, Category, Budgeted Amount, Collected Amount"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={() => uploadMutation.mutate()}
              disabled={!csvData.trim() || uploadMutation.isPending}
              data-testid="btn-upload"
            >
              <Upload className="h-4 w-4 mr-2" />
              {uploadMutation.isPending ? "Uploading..." : "Upload & Publish"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setCsvData(uploadType === "departments" ? deptTemplate : revenueTemplate)}
              data-testid="btn-load-template"
            >
              <Download className="h-4 w-4 mr-2" />
              Load Template
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* CSV Format Help */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">CSV Format Guide</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="font-medium mb-1">Department Budgets</p>
            <code className="text-xs bg-muted px-2 py-1 rounded block overflow-x-auto">
              Department,Category,Budgeted Amount,Spent Amount
            </code>
          </div>
          <div>
            <p className="font-medium mb-1">Revenue Sources</p>
            <code className="text-xs bg-muted px-2 py-1 rounded block overflow-x-auto">
              Source,Category,Budgeted Amount,Collected Amount
            </code>
          </div>
          <p className="text-muted-foreground">
            Amounts should be in whole dollars without commas (e.g., 5200000 not $5,200,000).
            The first row should be the header row.
          </p>
        </CardContent>
      </Card>

      {/* Upload History */}
      {uploads && uploads.length > 0 && (
        <Card data-testid="card-upload-history">
          <CardHeader>
            <CardTitle className="text-base">Upload History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {uploads.map((u) => (
                <div key={u.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u.filename}</p>
                    <p className="text-xs text-muted-foreground">{u.notes}</p>
                  </div>
                  <Badge
                    variant={u.status === "success" ? "default" : "destructive"}
                    className={u.status === "success"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      : ""}
                  >
                    {u.status === "success" ? (
                      <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Success</span>
                    ) : (
                      <span className="flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Error</span>
                    )}
                  </Badge>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {new Date(u.uploadedAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function Admin() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <LoginGate />;
  }

  return <AdminDashboard />;
}
