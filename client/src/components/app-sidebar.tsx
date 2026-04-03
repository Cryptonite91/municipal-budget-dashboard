import {
  LayoutDashboard,
  Wallet,
  PieChart,
  GitCompareArrows,
  HardHat,
  Upload,
  HelpCircle,
  Plus,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { useMunicipality } from "@/hooks/use-budget-data";
import { useTenantSlug } from "@/hooks/use-tenant";

export function AppSidebar() {
  const [location] = useLocation();
  const { data: muni } = useMunicipality();
  const slug = useTenantSlug();

  // Sidebar links use hash routing — tenant stays in the real URL search param
  // wouter Link href sets the hash portion only, tenant stays in window.location.search
  const tHref = (path: string) => path; // links are hash-only; tenant persists in URL

  // Active check: compare hash path 
  const isActive = (path: string) => {
    return location === path;
  };

  const citizenItems = [
    { title: "Overview", path: "/", icon: LayoutDashboard },
    { title: "Revenue Sources", path: "/revenue", icon: Wallet },
    { title: "Spending", path: "/spending", icon: PieChart },
    { title: "Compare Years", path: "/comparison", icon: GitCompareArrows },
    { title: "Capital Projects", path: "/projects", icon: HardHat },
  ];

  const adminItems = [
    { title: "Data Upload", path: "/admin", icon: Upload },
  ];

  const supportItems = [
    { title: "Help & Glossary", path: "/help", icon: HelpCircle },
  ];

  return (
    <Sidebar>
      <SidebarHeader className="p-4 pb-2">
        <div className="flex items-center gap-2.5">
          <svg
            viewBox="0 0 32 32"
            fill="none"
            className="w-7 h-7 shrink-0"
            aria-label="Municipal Budget Dashboard"
          >
            <rect x="4" y="14" width="24" height="16" rx="1.5" fill="currentColor" opacity="0.15" />
            <rect x="8" y="18" width="4" height="6" rx="0.5" fill="currentColor" opacity="0.4" />
            <rect x="14" y="18" width="4" height="6" rx="0.5" fill="currentColor" opacity="0.4" />
            <rect x="20" y="18" width="4" height="6" rx="0.5" fill="currentColor" opacity="0.4" />
            <path d="M2 14L16 4L30 14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="16" y1="4" x2="16" y2="11" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
          </svg>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate leading-tight">
              {muni?.name || "Municipal"} Budget
            </p>
            <p className="text-xs opacity-60 truncate">Transparency Dashboard</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Citizen View</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {citizenItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.path)}>
                    <Link href={tHref(item.path)} data-testid={`nav-${item.title.toLowerCase().replace(/\s/g, "-")}`}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Administration</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {adminItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.path)}>
                    <Link href={tHref(item.path)} data-testid={`nav-${item.title.toLowerCase().replace(/\s/g, "-")}`}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Support</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {supportItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.path)}>
                    <Link href={tHref(item.path)} data-testid={`nav-${item.title.toLowerCase().replace(/\s/g, "-")}`}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 pt-2 space-y-3">
        {muni && (
          <div className="text-xs opacity-50 space-y-0.5">
            <p>{muni.fiscalYear} · Pop. {muni.population.toLocaleString()}</p>
            <p>Updated {new Date(muni.lastUpdated).toLocaleDateString()}</p>
          </div>
        )}
        <a
          href="/onboarding"
          className="flex items-center gap-1.5 text-xs text-primary/70 hover:text-primary transition-colors cursor-pointer"
          data-testid="nav-onboarding"
          onClick={(e) => { e.preventDefault(); window.location.hash = "/onboarding"; }}
        >
          <Plus className="h-3 w-3" />
          Add your municipality
        </a>
      </SidebarFooter>
    </Sidebar>
  );
}
