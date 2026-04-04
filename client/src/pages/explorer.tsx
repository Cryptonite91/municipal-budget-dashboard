/**
 * Municipality Explorer
 * Browse all publicly listed municipalities by state.
 * Selecting a town navigates to that municipality's public dashboard.
 */

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { API_BASE } from "@/lib/api-base";
import {
  MapPin, Search, Users, Building2, ArrowRight,
  ChevronDown, Globe, TrendingUp,
} from "lucide-react";
import type { Municipality } from "@shared/schema";

// Safe subset returned by the public API (no password hash)
type PublicMuni = Omit<Municipality, "adminPasswordHash">;

const US_STATE_ABBREVS: Record<string, string> = {
  "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
  "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
  "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID",
  "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
  "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
  "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
  "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
  "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
  "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT",
  "Vermont": "VT", "Virginia": "VA", "Washington": "WA", "West Virginia": "WV",
  "Wisconsin": "WI", "Wyoming": "WY", "District of Columbia": "DC",
};

function stateAbbrev(state: string) {
  return US_STATE_ABBREVS[state] || state.slice(0, 2).toUpperCase();
}

// Navigate to a municipality's public dashboard by rewriting ?tenant= in the URL
function navigateToMuni(slug: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("tenant", slug);
  // Reset hash to the dashboard home
  url.hash = "/";
  window.location.href = url.toString();
}

// ─── Municipality card ────────────────────────────────────────────────────────
function MuniCard({ muni }: { muni: PublicMuni }) {
  return (
    <button
      className="w-full text-left group"
      onClick={() => navigateToMuni(muni.slug)}
      data-testid={`card-muni-${muni.slug}`}
    >
      <Card className="h-full transition-all duration-200 hover:shadow-md hover:border-primary/40 group-hover:bg-muted/30 cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            {/* State badge */}
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0 text-primary font-bold text-sm">
              {stateAbbrev(muni.state)}
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5" />
          </div>

          <div className="mt-3">
            <h3 className="text-sm font-semibold leading-tight">{muni.name}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{muni.state}</p>
          </div>

          <div className="mt-3 flex items-center gap-3 flex-wrap">
            {muni.population > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Users className="h-3 w-3" />
                {muni.population.toLocaleString()}
              </span>
            )}
            {muni.fiscalYear && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <TrendingUp className="h-3 w-3" />
                {muni.fiscalYear}
              </span>
            )}
          </div>

          <div className="mt-3 flex gap-1.5 flex-wrap">
            {muni.revenuePublished && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-emerald-600 border-emerald-200 dark:text-emerald-400 dark:border-emerald-800">
                Revenue
              </Badge>
            )}
            {muni.departmentsPublished && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-emerald-600 border-emerald-200 dark:text-emerald-400 dark:border-emerald-800">
                Spending
              </Badge>
            )}
            {muni.projectsPublished && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-emerald-600 border-emerald-200 dark:text-emerald-400 dark:border-emerald-800">
                Projects
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </button>
  );
}

// ─── State selector ───────────────────────────────────────────────────────────
function StateButton({
  state, count, selected, onClick,
}: { state: string; count: number; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-sm transition-colors text-left
        ${selected
          ? "bg-primary text-primary-foreground font-medium"
          : "hover:bg-muted text-foreground"
        }`}
      data-testid={`btn-state-${state.replace(/\s/g, "-").toLowerCase()}`}
    >
      <div className="flex items-center gap-2.5">
        <span className="text-xs font-bold w-6 shrink-0">{stateAbbrev(state)}</span>
        <span>{state}</span>
      </div>
      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${selected ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"}`}>
        {count}
      </span>
    </button>
  );
}

// ─── Main Explorer page ───────────────────────────────────────────────────────
export default function Explorer() {
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Fetch all listed municipalities
  const { data: allMunis = [], isLoading } = useQuery<PublicMuni[]>({
    queryKey: ["municipalities"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/municipalities`);
      return res.json();
    },
    staleTime: 30_000,
  });

  // Fetch available states
  const { data: states = [] } = useQuery<string[]>({
    queryKey: ["municipalities/states"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/municipalities/states`);
      return res.json();
    },
    staleTime: 30_000,
  });

  // Count per state
  const stateCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of allMunis) {
      counts[m.state] = (counts[m.state] || 0) + 1;
    }
    return counts;
  }, [allMunis]);

  // Filtered municipalities
  const filteredMunis = useMemo(() => {
    let munis = allMunis;
    if (selectedState) munis = munis.filter(m => m.state === selectedState);
    if (search.trim()) {
      const q = search.toLowerCase();
      munis = munis.filter(m =>
        m.name.toLowerCase().includes(q) ||
        m.state.toLowerCase().includes(q)
      );
    }
    return munis.sort((a, b) => a.name.localeCompare(b.name));
  }, [allMunis, selectedState, search]);

  const isFiltered = !!selectedState || !!search.trim();

  return (
    <div className="flex h-full">
      {/* Left panel — state list */}
      <aside className="w-56 shrink-0 border-r flex flex-col h-full overflow-hidden">
        <div className="px-4 py-4 border-b">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <MapPin className="h-4 w-4 text-primary" />
            Filter by State
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{states.length} state{states.length !== 1 ? "s" : ""} with data</p>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {/* All states option */}
          <StateButton
            state="All States"
            count={allMunis.length}
            selected={selectedState === null && !search}
            onClick={() => { setSelectedState(null); setSearch(""); }}
          />
          <div className="h-px bg-border my-1.5" />
          {states.map(state => (
            <StateButton
              key={state}
              state={state}
              count={stateCounts[state] || 0}
              selected={selectedState === state}
              onClick={() => setSelectedState(state === selectedState ? null : state)}
            />
          ))}
          {states.length === 0 && !isLoading && (
            <p className="text-xs text-muted-foreground text-center py-4 px-2">
              No municipalities have enabled directory listing yet.
            </p>
          )}
        </div>
      </aside>

      {/* Right panel — municipality cards */}
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-lg font-bold">
                {selectedState ? selectedState : "Municipality Explorer"}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isLoading
                  ? "Loading…"
                  : `${filteredMunis.length} municipality${filteredMunis.length !== 1 ? "ies" : "y"} with public budget data`
                }
              </p>
            </div>

            {/* Search */}
            <div className="relative w-60">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search municipalities…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs"
                data-testid="input-muni-search"
              />
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="p-6">
          {isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-36 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          )}

          {!isLoading && filteredMunis.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-4">
                <Building2 className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-sm font-semibold mb-1">
                {isFiltered ? "No matches found" : "No municipalities listed yet"}
              </h3>
              <p className="text-xs text-muted-foreground max-w-xs">
                {isFiltered
                  ? "Try a different state or search term."
                  : "Municipalities can enable their public listing from the admin panel."
                }
              </p>
            </div>
          )}

          {!isLoading && filteredMunis.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredMunis.map(muni => (
                <MuniCard key={muni.id} muni={muni} />
              ))}
            </div>
          )}

          {/* Footer hint */}
          {!isLoading && allMunis.length > 0 && (
            <div className="mt-8 text-center">
              <p className="text-xs text-muted-foreground">
                Don't see your municipality?{" "}
                <button
                  className="text-primary underline-offset-2 hover:underline"
                  onClick={() => {
                    const url = new URL(window.location.href);
                    url.hash = "/onboarding";
                    window.location.href = url.toString();
                  }}
                >
                  Add it here
                </button>
                {" "}or ask your finance officer to enable directory listing.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
