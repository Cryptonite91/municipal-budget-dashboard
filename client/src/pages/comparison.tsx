import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSummary, useYears, formatCurrency } from "@/hooks/use-budget-data";
import { Info, ArrowUpRight, ArrowDownRight, Minus, TrendingUp } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip as RechartsTooltip,
  Legend, CartesianGrid,
} from "recharts";

export default function Comparison() {
  const { data: years, isLoading: yearsLoading } = useYears();
  const [yearA, setYearA] = useState<string>("");
  const [yearB, setYearB] = useState<string>("");

  const currentYear = yearA || years?.[0] || "";
  const priorYear = yearB || years?.[1] || "";

  const { data: currentSummary, isLoading: loadingCurrent } = useSummary(currentYear);
  const { data: priorSummary, isLoading: loadingPrior } = useSummary(priorYear);

  if (yearsLoading || loadingCurrent || loadingPrior) {
    return (
      <div className="p-6 space-y-4">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  if (!currentSummary || !priorSummary || !years) return null;

  // Build comparison data
  const allDepts = new Set([
    ...currentSummary.departments.map(d => d.name),
    ...priorSummary.departments.map(d => d.name),
  ]);

  const comparisonData = Array.from(allDepts).map(name => {
    const curr = currentSummary.departments.find(d => d.name === name);
    const prior = priorSummary.departments.find(d => d.name === name);
    const currBudget = curr?.budgeted || 0;
    const priorBudget = prior?.budgeted || 0;
    const change = currBudget - priorBudget;
    const changePercent = priorBudget > 0 ? (change / priorBudget) * 100 : 0;

    return {
      name,
      current: currBudget,
      prior: priorBudget,
      change,
      changePercent,
    };
  }).sort((a, b) => b.current - a.current);

  const totalChange = currentSummary.totalBudget - priorSummary.totalBudget;
  const totalChangePercent = priorSummary.totalBudget > 0
    ? (totalChange / priorSummary.totalBudget) * 100 : 0;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Budget Comparison</h1>
          <p className="text-sm text-muted-foreground">
            Compare spending across fiscal years
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={currentYear} onValueChange={setYearA}>
            <SelectTrigger className="w-[120px]" data-testid="select-year-a">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">vs</span>
          <Select value={priorYear} onValueChange={setYearB}>
            <SelectTrigger className="w-[120px]" data-testid="select-year-b">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Overall Change */}
      <Card data-testid="card-overall-change">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Overall Budget Change</p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-xl font-bold tabular-nums">
                  {totalChange >= 0 ? "+" : ""}{formatCurrency(totalChange, true)}
                </p>
                <Badge
                  variant={totalChangePercent > 0 ? "default" : "secondary"}
                  className={`tabular-nums ${
                    totalChangePercent > 0
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      : totalChangePercent < 0
                      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      : ""
                  }`}
                >
                  {totalChangePercent >= 0 ? "+" : ""}{totalChangePercent.toFixed(1)}%
                </Badge>
              </div>
            </div>
            <div className="flex gap-6 text-sm">
              <div className="text-center">
                <p className="text-muted-foreground">{currentYear}</p>
                <p className="font-semibold tabular-nums">{formatCurrency(currentSummary.totalBudget, true)}</p>
              </div>
              <div className="text-center">
                <p className="text-muted-foreground">{priorYear}</p>
                <p className="font-semibold tabular-nums">{formatCurrency(priorSummary.totalBudget, true)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Side-by-Side Chart */}
      <Card data-testid="card-comparison-chart">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            Department Budgets Side-by-Side
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground/50 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-[240px] text-xs">
                Compare budgeted amounts by department across two fiscal years.
              </TooltipContent>
            </Tooltip>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonData} margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="name"
                  fontSize={11}
                  stroke="hsl(var(--muted-foreground))"
                  tickLine={false}
                  angle={-20}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  tickFormatter={(v) => `$${(v / 1000000).toFixed(0)}M`}
                  fontSize={12}
                  stroke="hsl(var(--muted-foreground))"
                />
                <RechartsTooltip
                  formatter={(value: number, name: string) => [
                    formatCurrency(value),
                    name === "current" ? currentYear : priorYear
                  ]}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--card))",
                    color: "hsl(var(--card-foreground))",
                    fontSize: "13px",
                  }}
                />
                <Legend
                  formatter={(value) => value === "current" ? currentYear : priorYear}
                />
                <Bar dataKey="prior" name="prior" fill="hsl(var(--muted-foreground))" opacity={0.3} radius={[4, 4, 0, 0]} barSize={28} />
                <Bar dataKey="current" name="current" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Department Change Table */}
      <Card data-testid="card-change-table">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Year-over-Year Changes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            <div className="grid grid-cols-[1fr_100px_100px_90px_70px] gap-2 px-3 py-2 text-xs text-muted-foreground font-medium border-b">
              <span>Department</span>
              <span className="text-right">{currentYear}</span>
              <span className="text-right">{priorYear}</span>
              <span className="text-right">Change</span>
              <span className="text-right">%</span>
            </div>
            {comparisonData.map((row) => (
              <div
                key={row.name}
                className="grid grid-cols-[1fr_100px_100px_90px_70px] gap-2 px-3 py-2 text-sm rounded hover:bg-muted/30 transition-colors"
                data-testid={`row-${row.name.toLowerCase().replace(/[&\s]/g, "-")}`}
              >
                <span className="font-medium">{row.name}</span>
                <span className="text-right tabular-nums">{formatCurrency(row.current, true)}</span>
                <span className="text-right tabular-nums text-muted-foreground">{formatCurrency(row.prior, true)}</span>
                <span className={`text-right tabular-nums flex items-center justify-end gap-1 ${
                  row.change > 0 ? "text-red-600 dark:text-red-400" :
                  row.change < 0 ? "text-emerald-600 dark:text-emerald-400" :
                  "text-muted-foreground"
                }`}>
                  {row.change > 0 ? <ArrowUpRight className="h-3 w-3" /> :
                   row.change < 0 ? <ArrowDownRight className="h-3 w-3" /> :
                   <Minus className="h-3 w-3" />}
                  {formatCurrency(Math.abs(row.change), true)}
                </span>
                <span className={`text-right tabular-nums text-xs ${
                  row.changePercent > 0 ? "text-red-600 dark:text-red-400" :
                  row.changePercent < 0 ? "text-emerald-600 dark:text-emerald-400" :
                  "text-muted-foreground"
                }`}>
                  {row.changePercent >= 0 ? "+" : ""}{row.changePercent.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            Increases shown in red, decreases in green.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
