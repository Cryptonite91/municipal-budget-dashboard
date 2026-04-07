import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Building2, ChevronRight, ChevronLeft, CheckCircle2, Eye } from "lucide-react";
import { API_BASE } from "@/lib/api-base";
import { normalizeYear, SELECTABLE_YEARS } from "@/lib/year-utils";

const STEPS = [
  { id: 1, label: "Municipality Info" },
  { id: 2, label: "Admin Account" },
  { id: 3, label: "Review & Submit" },
];

const US_STATES = ["Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","Florida","Georgia","Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland","Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey","New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina","South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming"];

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [createdSlug, setCreatedSlug] = useState("");

  const [form, setForm] = useState({
    name: "",
    state: "",
    population: "",
    fiscalYear: "2026",
    contactEmail: "",
    contactPhone: "",
    website: "",
    adminEmail: "",
    password: "",
    confirmPassword: "",
  });

  const set = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }));

  const canNext = () => {
    if (step === 1) return form.name.trim() && form.state && form.population;
    if (step === 2) return form.adminEmail.includes("@") && form.password.length >= 6 && form.password === form.confirmPassword;
    return true;
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/onboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          state: form.state,
          population: parseInt(form.population),
          fiscalYear: form.fiscalYear,
          contactEmail: form.contactEmail || form.adminEmail,
          contactPhone: form.contactPhone || undefined,
          website: form.website || undefined,
          adminEmail: form.adminEmail,
          password: form.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Setup failed");
      setCreatedSlug(data.municipality?.slug || "");
      setStep(3);
    } catch (err: any) {
      toast({ title: "Setup failed", description: err.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const goToDashboard = () => {
    // Navigate to canonical URL format: tenant in real search, hash for route
    window.location.href = `${window.location.origin}/?tenant=${createdSlug}#/`;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2.5 mb-3">
          <svg viewBox="0 0 32 32" fill="none" className="w-8 h-8" aria-label="CivicBudget">
            <rect x="4" y="14" width="24" height="16" rx="1.5" fill="currentColor" opacity="0.15" />
            <rect x="8" y="18" width="4" height="6" rx="0.5" fill="currentColor" opacity="0.4" />
            <rect x="14" y="18" width="4" height="6" rx="0.5" fill="currentColor" opacity="0.4" />
            <rect x="20" y="18" width="4" height="6" rx="0.5" fill="currentColor" opacity="0.4" />
            <path d="M2 14L16 4L30 14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-xl font-bold">CivicBudget</span>
        </div>
        <p className="text-muted-foreground text-sm">Set up your municipality's public budget dashboard in minutes.</p>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((s, idx) => (
          <div key={s.id} className="flex items-center gap-2">
            <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors ${
              step > s.id ? "bg-primary text-primary-foreground" :
              step === s.id ? "bg-primary text-primary-foreground" :
              "bg-muted text-muted-foreground"
            }`}>
              {step > s.id ? <CheckCircle2 className="h-4 w-4" /> : s.id}
            </div>
            <span className={`text-xs font-medium hidden sm:block ${step === s.id ? "text-foreground" : "text-muted-foreground"}`}>
              {s.label}
            </span>
            {idx < STEPS.length - 1 && <div className="w-8 h-px bg-border mx-1" />}
          </div>
        ))}
      </div>

      <Card className="w-full max-w-lg" data-testid="card-onboarding">
        {/* Step 1: Municipality Info */}
        {step === 1 && (
          <>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Municipality Information
              </CardTitle>
              <CardDescription>Basic details about your town or city.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-sm font-medium mb-1.5 block">Municipality Name *</label>
                  <Input
                    placeholder="e.g. Maplewood"
                    value={form.name}
                    onChange={e => set("name", e.target.value)}
                    data-testid="input-muni-name"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">State *</label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={form.state}
                    onChange={e => set("state", e.target.value)}
                    data-testid="select-muni-state"
                  >
                    <option value="">Select state</option>
                    {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Population *</label>
                  <Input
                    type="number"
                    placeholder="e.g. 28500"
                    value={form.population}
                    onChange={e => set("population", e.target.value)}
                    data-testid="input-population"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Current Year</label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={form.fiscalYear}
                    onChange={e => set("fiscalYear", normalizeYear(e.target.value))}
                  >
                    {SELECTABLE_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Contact Email</label>
                  <Input placeholder="finance@yourtownvt.gov" value={form.contactEmail} onChange={e => set("contactEmail", e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Phone</label>
                  <Input placeholder="(802) 555-0100" value={form.contactPhone} onChange={e => set("contactPhone", e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className="text-sm font-medium mb-1.5 block">Website</label>
                  <Input placeholder="https://yourtown.gov" value={form.website} onChange={e => set("website", e.target.value)} />
                </div>
              </div>
            </CardContent>
          </>
        )}

        {/* Step 2: Admin account */}
        {step === 2 && (
          <>
            <CardHeader>
              <CardTitle className="text-base">Create Admin Account</CardTitle>
              <CardDescription>
                Your admin email and password are used to sign in to the admin portal.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Admin Email *</label>
                <Input
                  type="email"
                  placeholder="finance@yourmunicipality.gov"
                  value={form.adminEmail}
                  onChange={e => set("adminEmail", e.target.value)}
                  autoComplete="email"
                  data-testid="input-admin-email"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Admin Password *</label>
                <Input
                  type="password"
                  placeholder="At least 6 characters"
                  value={form.password}
                  onChange={e => set("password", e.target.value)}
                  data-testid="input-password"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Confirm Password *</label>
                <Input
                  type="password"
                  placeholder="Re-enter password"
                  value={form.confirmPassword}
                  onChange={e => set("confirmPassword", e.target.value)}
                  data-testid="input-confirm-password"
                />
                {form.confirmPassword && form.password !== form.confirmPassword && (
                  <p className="text-xs text-destructive mt-1">Passwords do not match</p>
                )}
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">What happens next:</p>
                <p>• Your request will be reviewed by our team (usually within 1 business day)</p>
                <p>• You'll receive an email when your municipality is approved</p>
                <p>• Once approved, sign in to the admin portal to upload data</p>
                <p>• Citizens can browse, comment, and subscribe to updates</p>
              </div>
            </CardContent>
          </>
        )}

        {/* Step 3: Pending approval */}
        {step === 3 && (
          <>
            <CardHeader className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                <CheckCircle2 className="h-8 w-8 text-amber-600 dark:text-amber-400" />
              </div>
              <CardTitle className="text-base">Request submitted!</CardTitle>
              <CardDescription>
                Your registration for {form.name}, {form.state} is under review.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-2">
                <p className="font-medium text-foreground">What happens next</p>
                <ul className="text-xs text-muted-foreground space-y-1.5">
                  <li>• Our platform team will review your request, usually within 1 business day.</li>
                  <li>• Once approved, you can sign in at the admin portal using <span className="font-mono text-foreground">{form.adminEmail}</span>.</li>
                  <li>• You'll be able to upload budget data and publish it to citizens.</li>
                </ul>
              </div>
              <p className="text-xs text-center text-muted-foreground">
                Questions? Email <a href="mailto:support@civicbudget.gov" className="underline">support@civicbudget.gov</a>
              </p>
            </CardContent>
          </>
        )}

        {/* Navigation */}
        {step < 3 && (
          <div className="flex items-center justify-between p-6 pt-0 border-t mt-4">
            <Button
              variant="ghost"
              onClick={() => setStep(s => s - 1)}
              disabled={step === 1}
              data-testid="btn-back"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            {step < 2 ? (
              <Button onClick={() => setStep(s => s + 1)} disabled={!canNext()} data-testid="btn-next">
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={!canNext() || isLoading} data-testid="btn-launch">
                {isLoading ? "Creating..." : "Launch Dashboard"}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        )}
      </Card>

      <p className="mt-6 text-xs text-muted-foreground">
        Already have a dashboard?{" "}
        <button
          className="underline"
          onClick={() => setLocation("/")}
        >
          View demo
        </button>
      </p>
    </div>
  );
}
