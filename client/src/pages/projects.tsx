import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCapitalProjects, formatCurrency } from "@/hooks/use-budget-data";
import { Info, CheckCircle2, AlertTriangle, Clock } from "lucide-react";

const STATUS_CONFIG: Record<string, { color: string; bgColor: string; icon: React.ReactNode; label: string }> = {
  "on-track": {
    color: "text-emerald-700 dark:text-emerald-400",
    bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    label: "On Track",
  },
  "at-risk": {
    color: "text-amber-700 dark:text-amber-400",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    label: "At Risk",
  },
  "behind": {
    color: "text-red-700 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/30",
    icon: <Clock className="h-3.5 w-3.5" />,
    label: "Behind",
  },
};

export default function Projects() {
  const { data: projects, isLoading } = useCapitalProjects();

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
      </div>
    );
  }

  if (!projects) return null;

  const totalBudget = projects.reduce((s, p) => s + p.totalBudget, 0);
  const totalSpent = projects.reduce((s, p) => s + p.spentToDate, 0);
  const onTrack = projects.filter(p => p.status === "on-track").length;
  const atRisk = projects.filter(p => p.status === "at-risk").length;
  const behind = projects.filter(p => p.status === "behind").length;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-xl font-bold">Capital Projects</h1>
        <p className="text-sm text-muted-foreground">
          Active infrastructure and improvement projects
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Projects</p>
            <p className="text-xl font-bold tabular-nums">{projects.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Investment</p>
            <p className="text-xl font-bold tabular-nums">{formatCurrency(totalBudget, true)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Spent to Date</p>
            <p className="text-xl font-bold tabular-nums">{formatCurrency(totalSpent, true)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Status</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs">{onTrack} on track</Badge>
              {atRisk > 0 && <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs">{atRisk} at risk</Badge>}
              {behind > 0 && <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-xs">{behind} behind</Badge>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Project Cards */}
      <div className="space-y-3">
        {projects.map((project) => {
          const status = STATUS_CONFIG[project.status] || STATUS_CONFIG["on-track"];
          const budgetPct = ((project.spentToDate / project.totalBudget) * 100).toFixed(0);

          return (
            <Card key={project.id} data-testid={`card-project-${project.id}`}>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold">{project.name}</h3>
                      <Badge variant="outline" className={`${status.color} ${status.bgColor} border-0 text-xs shrink-0`}>
                        <span className="flex items-center gap-1">
                          {status.icon}
                          {status.label}
                        </span>
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{project.department}</p>
                    {project.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{project.description}</p>
                    )}
                  </div>
                  <div className="flex gap-6 text-sm shrink-0">
                    <div>
                      <p className="text-xs text-muted-foreground">Budget</p>
                      <p className="font-semibold tabular-nums">{formatCurrency(project.totalBudget, true)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Spent</p>
                      <p className="font-semibold tabular-nums">{formatCurrency(project.spentToDate, true)}</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {project.percentComplete}% complete · {budgetPct}% of budget spent
                    </span>
                    <span className="text-muted-foreground">
                      {new Date(project.startDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                      {" → "}
                      {new Date(project.expectedEnd).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                    </span>
                  </div>
                  <Progress
                    value={project.percentComplete}
                    className={`h-2 ${
                      project.status === "at-risk" ? "[&>div]:bg-amber-500" :
                      project.status === "behind" ? "[&>div]:bg-red-500" : ""
                    }`}
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
