import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useRevenue, useYears, formatCurrency } from "@/hooks/use-budget-data";
import { Info, ChevronDown, ChevronRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip as RechartsTooltip, Cell } from "recharts";

const CATEGORY_COLORS: Record<string, string> = {
  "Property Taxes": "hsl(195, 70%, 34%)",
  "State Aid": "hsl(24, 70%, 50%)",
  "Fees": "hsl(160, 45%, 38%)",
  "Grants": "hsl(45, 80%, 48%)",
  "Other": "hsl(220, 35%, 50%)",
};

export default function Revenue() {
  const { data: years } = useYears();
  const [selectedYear, setSelectedYear] = useState<string>("");
  const activeYear = selectedYear || years?.[0] || "";
  const { data: revenue, isLoading } = useRevenue(activeYear);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
    );
  }

  if (!revenue) return null;

  // Group by category
  const byCategory: Record<string, { budgeted: number; collected: number; sources: typeof revenue }> = {};
  for (const r of revenue) {
    if (!byCategory[r.category]) byCategory[r.category] = { budgeted: 0, collected: 0, sources: [] };
    byCategory[r.category].budgeted += r.budgetedAmount;
    byCategory[r.category].collected += r.collectedAmount;
    byCategory[r.category].sources.push(r);
  }

  const totalBudgeted = revenue.reduce((s, r) => s + r.budgetedAmount, 0);
  const totalCollected = revenue.reduce((s, r) => s + r.collectedAmount, 0);

  const chartData = Object.entries(byCategory)
    .map(([name, vals]) => ({
      name,
      budgeted: vals.budgeted,
      collected: vals.collected,
      percent: ((vals.budgeted / totalBudgeted) * 100).toFixed(1),
    }))
    .sort((a, b) => b.budgeted - a.budgeted);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Revenue Sources</h1>
          <p className="text-sm text-muted-foreground">
            Where the town's money comes from in {activeYear}
          </p>
        </div>
        <Select value={activeYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-[140px]" data-testid="select-year-revenue">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years?.map((y) => (
              <SelectItem key={y} value={y}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Budgeted Revenue</p>
            <p className="text-xl font-bold tabular-nums">{formatCurrency(totalBudgeted, true)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Collected</p>
            <p className="text-xl font-bold tabular-nums">{formatCurrency(totalCollected, true)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Collection Rate</p>
            <p className="text-xl font-bold tabular-nums">
              {((totalCollected / totalBudgeted) * 100).toFixed(1)}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Flow / Bar Chart */}
      <Card data-testid="card-revenue-chart">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            Revenue by Source Type
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground/50 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-[240px] text-xs">
                This chart shows the five main categories of revenue. Click a category below to see individual sources.
              </TooltipContent>
            </Tooltip>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 20 }}>
                <XAxis
                  type="number"
                  tickFormatter={(v) => `$${(v / 1000000).toFixed(0)}M`}
                  fontSize={12}
                  stroke="hsl(var(--muted-foreground))"
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  fontSize={12}
                  stroke="hsl(var(--muted-foreground))"
                  tickLine={false}
                />
                <RechartsTooltip
                  formatter={(value: number, name: string) => [
                    formatCurrency(value),
                    name === "budgeted" ? "Budgeted" : "Collected"
                  ]}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--card))",
                    color: "hsl(var(--card-foreground))",
                    fontSize: "13px",
                  }}
                />
                <Bar dataKey="budgeted" name="budgeted" radius={[0, 4, 4, 0]} barSize={20} opacity={0.3}>
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] || "#888"} />
                  ))}
                </Bar>
                <Bar dataKey="collected" name="collected" radius={[0, 4, 4, 0]} barSize={20}>
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] || "#888"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 justify-center mt-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-2 rounded-sm bg-primary/30" />
              Budgeted
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-2 rounded-sm bg-primary" />
              Collected
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Expandable Category Details */}
      <div className="space-y-2">
        <h2 className="text-base font-semibold mb-3">Revenue Source Details</h2>
        {Object.entries(byCategory)
          .sort(([, a], [, b]) => b.budgeted - a.budgeted)
          .map(([category, vals]) => {
            const isExpanded = expandedCategory === category;
            const pct = ((vals.budgeted / totalBudgeted) * 100).toFixed(1);
            return (
              <Card key={category} data-testid={`card-revenue-${category.toLowerCase().replace(/\s/g, "-")}`}>
                <button
                  className="w-full text-left p-4 flex items-center gap-3 hover:bg-muted/30 transition-colors rounded-lg"
                  onClick={() => setExpandedCategory(isExpanded ? null : category)}
                  data-testid={`btn-expand-${category.toLowerCase().replace(/\s/g, "-")}`}
                >
                  <div
                    className="w-3 h-3 rounded-sm shrink-0"
                    style={{ backgroundColor: CATEGORY_COLORS[category] }}
                  />
                  {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  <span className="font-medium flex-1">{category}</span>
                  <Badge variant="secondary" className="tabular-nums">{pct}%</Badge>
                  <span className="text-sm font-semibold tabular-nums">{formatCurrency(vals.budgeted, true)}</span>
                </button>
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-2 border-t mx-4 pt-3">
                    {vals.sources.map((s) => (
                      <div key={s.id} className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">{s.source}</span>
                        <div className="flex items-center gap-4">
                          <span className="tabular-nums">{formatCurrency(s.budgetedAmount, true)}</span>
                          <span className="text-xs text-muted-foreground tabular-nums w-20 text-right">
                            {((s.collectedAmount / s.budgetedAmount) * 100).toFixed(0)}% collected
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
      </div>
    </div>
  );
}
