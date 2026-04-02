import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { UploadHistory } from "@shared/schema";
import { Upload, FileText, CheckCircle2, AlertCircle, Download } from "lucide-react";

export default function Admin() {
  const { toast } = useToast();
  const [uploadType, setUploadType] = useState<string>("departments");
  const [uploadYear, setUploadYear] = useState<string>("FY2026");
  const [csvData, setCsvData] = useState<string>("");

  const { data: uploads } = useQuery<UploadHistory[]>({
    queryKey: ["/api/uploads"],
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/upload", {
        data: csvData,
        type: uploadType,
        year: uploadYear,
      });
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
      <div>
        <h1 className="text-xl font-bold">Data Upload</h1>
        <p className="text-sm text-muted-foreground">
          Upload budget data for your municipality. CSV format accepted.
        </p>
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
