import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useSummary, useYears, useMunicipality, formatCurrency, formatPercent } from "@/hooks/use-budget-data";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  PieChart,
  Users,
  Info,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Shield,
  GraduationCap,
  Wrench,
  TreePine,
  Building2,
  Heart,
  BookOpen,
} from "lucide-react";
import { PieChart as RechartsPie, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";

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

function KpiCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  tooltip,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: { value: number; label: string };
  tooltip?: string;
}) {
  return (
    <Card data-testid={`kpi-${title.toLowerCase().replace(/\s/g, "-")}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
          {title}
          {tooltip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3.5 w-3.5 text-muted-foreground/50 cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-[220px] text-xs">{tooltip}</TooltipContent>
            </Tooltip>
          )}
        </CardTitle>
        <div className="text-muted-foreground/40">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-xl font-bold tabular-nums">{value}</div>
        {trend && (
          <div className={`flex items-center gap-1 text-xs mt-1 ${
            trend.value > 0 ? "text-emerald-600 dark:text-emerald-400" :
            trend.value < 0 ? "text-red-600 dark:text-red-400" :
            "text-muted-foreground"
          }`}>
            {trend.value > 0 ? <ArrowUpRight className="h-3 w-3" /> :
             trend.value < 0 ? <ArrowDownRight className="h-3 w-3" /> :
             <Minus className="h-3 w-3" />}
            <span>{formatPercent(trend.value)}</span>
            <span className="text-muted-foreground">{trend.label}</span>
          </div>
        )}
        {subtitle && !trend && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

function DollarBreakdown({ data, municipalityName }: { data: { name: string; budgeted: number }[]; municipalityName: string }) {
  const total = data.reduce((s, d) => s + d.budgeted, 0);
  const pieData = data.map(d => ({
    name: d.name,
    value: d.budgeted,
    percent: ((d.budgeted / total) * 100).toFixed(1),
  }));

  return (
    <Card className="col-span-full" data-testid="card-dollar-breakdown">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">
          Where does your {municipalityName} dollar go?
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          For every dollar in the budget, here is how it is allocated across departments.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-center">
          <div className="h-[240px] w-full max-w-[280px] mx-auto">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPie>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={95}
                  paddingAngle={2}
                  dataKey="value"
                  animationDuration={800}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={DEPT_COLORS[entry.name] || `hsl(${i * 50}, 40%, 50%)`} />
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
              </RechartsPie>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">
            {pieData.map((d) => (
              <div key={d.name} className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-sm shrink-0"
                  style={{ backgroundColor: DEPT_COLORS[d.name] || "#888" }}
                />
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  {DEPT_ICONS[d.name]}
                </div>
                <span className="text-sm font-medium flex-1 min-w-0 truncate">{d.name}</span>
                <span className="text-sm tabular-nums font-semibold">{d.percent}¢</span>
                <span className="text-xs text-muted-foreground tabular-nums w-20 text-right">
                  {formatCurrency(d.value, true)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: years, isLoading: yearsLoading } = useYears();
  const [selectedYear, setSelectedYear] = useState<string>("");
  const activeYear = selectedYear || years?.[0] || "";
  const { data: summary, isLoading } = useSummary(activeYear);
  const { data: muni } = useMunicipality();

  if (yearsLoading || isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{summary.municipalityName} Budget Overview</h1>
          <p className="text-sm text-muted-foreground">
            Fiscal Year {activeYear} · Population {summary.population.toLocaleString()}
          </p>
        </div>
        <Select value={activeYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-[140px]" data-testid="select-year">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years?.map((y) => (
              <SelectItem key={y} value={y}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Budget Spent YTD Callout */}
      <Card className="bg-primary/5 border-primary/20" data-testid="card-ytd-spent">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4 mb-2">
            <div>
              <p className="text-sm font-medium">Budget Spent Year-to-Date</p>
              <p className="text-2xl font-bold tabular-nums">{summary.percentSpent.toFixed(1)}%</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">
                {formatCurrency(summary.totalSpent)} of {formatCurrency(summary.totalBudget)}
              </p>
            </div>
          </div>
          <Progress value={summary.percentSpent} className="h-2.5" />
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Budget"
          value={formatCurrency(summary.totalBudget, true)}
          icon={<DollarSign className="h-4 w-4" />}
          trend={{ value: summary.yoyChange, label: "vs prior year" }}
          tooltip="The total approved budget for all departments in this fiscal year."
        />
        <KpiCard
          title="Cost per Resident"
          value={formatCurrency(summary.costPerResident)}
          icon={<Users className="h-4 w-4" />}
          subtitle={`Based on ${summary.population.toLocaleString()} residents`}
          tooltip="Total budget divided by the town's population. Shows how much budget is allocated per person."
        />
        <KpiCard
          title="Revenue Efficiency"
          value={`${summary.revenueEfficiency.toFixed(1)}%`}
          icon={summary.revenueEfficiency >= 95 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          subtitle="Revenue collected vs budgeted"
          tooltip="How much of the expected revenue has actually been collected. Above 95% is good."
        />
        <KpiCard
          title="Budget Reserve"
          value={`${summary.budgetReserve.toFixed(1)}%`}
          icon={<PieChart className="h-4 w-4" />}
          subtitle="Unspent funds remaining"
          tooltip="Percentage of the total budget that has not yet been spent. Healthy reserves help cover unexpected costs."
        />
      </div>

      {/* Top 3 Spending Categories */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {summary.departments.slice(0, 3).map((dept, i) => {
          const pct = ((dept.budgeted / summary.totalBudget) * 100).toFixed(1);
          return (
            <Card key={dept.name} data-testid={`card-top-dept-${i}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-2.5 h-2.5 rounded-sm"
                    style={{ backgroundColor: DEPT_COLORS[dept.name] }}
                  />
                  <span className="text-sm font-medium">{dept.name}</span>
                </div>
                <p className="text-lg font-bold tabular-nums">{formatCurrency(dept.budgeted, true)}</p>
                <p className="text-xs text-muted-foreground">{pct}% of total budget</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Dollar Breakdown */}
      <DollarBreakdown data={summary.departments} municipalityName={summary.municipalityName} />
    </div>
  );
}
