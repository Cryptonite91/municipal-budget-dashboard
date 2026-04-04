/**
 * MunicipalityGate
 * Wraps citizen-facing pages. If the municipality has `listed = false` and the
 * viewer is not an authenticated admin, a friendly placeholder is shown instead
 * of the actual budget data.
 */

import { Building2, Globe, ArrowRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMunicipality } from "@/hooks/use-budget-data";
import { useAuth } from "@/hooks/use-auth";

interface MunicipalityGateProps {
  children: React.ReactNode;
}

export function MunicipalityGate({ children }: MunicipalityGateProps) {
  const { data: muni, isLoading } = useMunicipality();
  const { isAuthenticated } = useAuth();

  // While loading, render nothing (parent page handles its own skeleton)
  if (isLoading) return <>{children}</>;

  // If muni is listed (or admin is logged in), show the real content
  if (!muni || muni.listed || isAuthenticated) {
    return <>{children}</>;
  }

  // Unlisted + not admin → placeholder
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 py-16 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
        <Lock className="h-7 w-7 text-muted-foreground" />
      </div>

      <h1 className="text-lg font-bold mb-2">Dashboard Not Yet Public</h1>
      <p className="text-sm text-muted-foreground max-w-sm leading-relaxed mb-8">
        {muni.name} hasn't enabled public access to their budget dashboard yet.
        Check back soon, or explore other municipalities that have made their
        data available.
      </p>

      <div className="flex flex-col sm:flex-row items-center gap-3">
        <Button
          variant="default"
          className="gap-2"
          onClick={() => {
            const url = new URL(window.location.href);
            url.searchParams.delete("tenant");
            url.hash = "/explorer";
            window.location.href = url.toString();
          }}
          data-testid="btn-gate-explore"
        >
          <Globe className="h-4 w-4" />
          Browse Municipalities
          <ArrowRight className="h-4 w-4" />
        </Button>

        <Button
          variant="outline"
          className="gap-2"
          onClick={() => {
            const url = new URL(window.location.href);
            url.hash = "/admin";
            window.location.href = url.toString();
          }}
          data-testid="btn-gate-admin"
        >
          <Building2 className="h-4 w-4" />
          Admin Sign In
        </Button>
      </div>
    </div>
  );
}
