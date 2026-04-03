import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useDepartments, useYears, useSummary, formatCurrency } from "@/hooks/use-budget-data";
import { CitizenEngagement } from "@/components/citizen-engagement";
import { Info, ChevronDown, ChevronRight, Shield, GraduationCap, Wrench, TreePine, Building2, Heart, BookOpen } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";

const DEPT_COLORS: Record<string, string> = {
  "Education": "hsl(195, 70%, 34%)",
  "Public Safety": "hsl(24, 70%, 50%)",
  "Public Works": "hsl(160, 45%, 38%)",
  "Parks & Recreation": "hsl(120, 40%, 42%)",
  "Administration": "hsl(220, 35%, 50%)",
  "Social Services": "hsl(340, 50%, 45%)",
  "Library": "hsl(45, 80%, 48%)",
};

const DEPT_ICONS: Record<string, React.ReactNode> = {
  "Education": <GraduationCap className="h-4 w-4" />,
  "Public Safety": <Shield className="h-4 w-4" />,
  "Public Works": <Wrench className="h-4 w-4" />,
  "Parks & Recreation": <TreePine className="h-4 w-4" />,
  "Administration": <Building2 className="h-4 w-4" />,
  "Social Services": <Heart className="h-4 w-4" />,
  "Library": <BookOpen className="h-4 w-4" />,
};

export default function Spending() {
  const { data: years } = useYears();
  const [selectedYear, setSelectedYear] = useState<string>("");
  const activeYear = selectedYear || years?.[0] || "";
  const { data: departments, isLoading } = useDepartments(activeYear);
  const { data: summary } = useSummary(activeYear);
  const [showPercent, setShowPercent] = useState(false);
  const [expandedDept, setExpandedDept] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  if (!departments || !summary) return null;

  // Group by department
  const byDept: Record<string, { budgeted: number; spent: number; categories: typeof departments }> = {};
  for (const d of departments) {
    if (!byDept[d.department]) byDept[d.department] = { budgeted: 0, spent: 0, categories: [] };
    byDept[d.department].budgeted += d.budgetedAmount;
    byDept[d.department].spent += d.spentAmount;
    byDept[d.department].categories.push(d);
  }

  const totalBudgeted = summary.totalBudget;
  const pieData = Object.entries(byDept)
    .map(([name, vals]) => ({
      name,
      value: vals.budgeted,
      spent: vals.spent,
      percent: ((vals.budgeted / totalBudgeted) * 100).toFixed(1),
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Spending by Department</h1>
          <p className="text-sm text-muted-foreground">
            How the {activeYear} budget is allocated and spent
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="show-percent"
              checked={showPercent}
              onCheckedChange={setShowPercent}
              data-testid="switch-percent"
            />
            <Label htmlFor="show-percent" className="text-sm">Show %</Label>
          </div>
          <Select value={activeYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[140px]" data-testid="select-year-spending">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years?.map((y) => (
                <SelectItem key={y} value={y}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Interactive Donut */}
      <Card data-testid="card-spending-chart">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            Budget Allocation
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground/50 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-[240px] text-xs">
                This donut chart shows how the total budget is divided. Click a department below for details.
              </TooltipContent>
            </Tooltip>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 items-start">
            <div className="h-[280px] w-full max-w-[300px] mx-auto relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={110}
                    paddingAngle={2}
                    dataKey="value"
                    animationDuration={800}
                  >
                    {pieData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={DEPT_COLORS[entry.name] || "#888"}
                        opacity={expandedDept && expandedDept !== entry.name ? 0.3 : 1}
                        cursor="pointer"
                        onClick={() => setExpandedDept(expandedDept === entry.name ? null : entry.name)}
                      />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--card))",
                      color: "hsl(var(--card-foreground))",
                      fontSize: "13px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-lg font-bold tabular-nums">{formatCurrency(totalBudgeted, true)}</p>
                </div>
              </div>
            </div>

            {/* Department List */}
            <div className="space-y-1.5">
              {pieData.map((dept) => {
                const isExpanded = expandedDept === dept.name;
                const deptData = byDept[dept.name];
                const spentPct = ((dept.spent / dept.value) * 100).toFixed(0);

                return (
                  <div key={dept.name}>
                    <button
                      className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-muted/30 transition-colors rounded-lg"
                      onClick={() => setExpandedDept(isExpanded ? null : dept.name)}
                      data-testid={`btn-dept-${dept.name.toLowerCase().replace(/[&\s]/g, "-")}`}
                    >
                      <div
                        className="w-3 h-3 rounded-sm shrink-0"
                        style={{ backgroundColor: DEPT_COLORS[dept.name] }}
                      />
                      <div className="flex items-center gap-1.5 text-muted-foreground shrink-0">
                        {DEPT_ICONS[dept.name]}
                      </div>
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                      <span className="text-sm font-medium flex-1 min-w-0 truncate">{dept.name}</span>
                      <Badge variant="outline" className="tabular-nums text-xs shrink-0">{spentPct}% spent</Badge>
                      <span className="text-sm font-semibold tabular-nums shrink-0">
                        {showPercent ? `${dept.percent}%` : formatCurrency(dept.value, true)}
                      </span>
                    </button>
                    {isExpanded && deptData && (
                      <div className="ml-10 pl-3 border-l-2 border-muted space-y-1.5 py-2 mb-1">
                        {deptData.categories.map((cat) => (
                          <div key={cat.id} className="flex items-center justify-between text-sm px-2">
                            <span className="text-muted-foreground">{cat.category}</span>
                            <div className="flex items-center gap-3">
                              <span className="tabular-nums">
                                {showPercent
                                  ? `${((cat.budgetedAmount / totalBudgeted) * 100).toFixed(1)}%`
                                  : formatCurrency(cat.budgetedAmount, true)}
                              </span>
                              <span className="text-xs text-muted-foreground tabular-nums w-16 text-right">
                                {((cat.spentAmount / cat.budgetedAmount) * 100).toFixed(0)}% spent
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
      <CitizenEngagement section="spending" />
    </div>
  );
}
