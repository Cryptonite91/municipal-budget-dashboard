import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import React from "react";
import { API_BASE } from "@/lib/api-base";

type AuthRole = "municipal" | "platform" | null;

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  role: AuthRole;
  email: string | null;
  // Municipal admin login (email + password for tenant)
  login: (opts: { email: string; password: string; tenantSlug: string }) => Promise<boolean>;
  // Platform admin login (email + password, no tenant)
  platformLogin: (opts: { email: string; password: string }) => Promise<boolean>;
  logout: (tenantSlug?: string) => void;
  getToken: () => string | null;
  isPlatformAdmin: () => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Module-level token storage (survives re-renders, cleared on page reload)
let sessionToken: string | null = null;
let sessionRole: AuthRole = null;
let sessionEmail: string | null = null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<AuthRole>(null);
  const [email, setEmail] = useState<string | null>(null);

  const login = useCallback(async ({ email: emailInput, password, tenantSlug }: { email: string; password: string; tenantSlug: string }): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login?tenant=${tenantSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailInput, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid credentials");
        setIsLoading(false);
        return false;
      }
      sessionToken = data.token;
      sessionRole = data.role ?? "municipal";
      sessionEmail = data.email ?? emailInput;
      setIsAuthenticated(true);
      setRole(sessionRole);
      setEmail(sessionEmail);
      setIsLoading(false);
      return true;
    } catch {
      setError("Login failed. Please try again.");
      setIsLoading(false);
      return false;
    }
  }, []);

  const platformLogin = useCallback(async ({ email: emailInput, password }: { email: string; password: string }): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/auth/platform-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailInput, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid credentials");
        setIsLoading(false);
        return false;
      }
      sessionToken = data.token;
      sessionRole = "platform";
      sessionEmail = data.email ?? emailInput;
      setIsAuthenticated(true);
      setRole("platform");
      setEmail(sessionEmail);
      setIsLoading(false);
      return true;
    } catch {
      setError("Login failed. Please try again.");
      setIsLoading(false);
      return false;
    }
  }, []);

  const logout = useCallback((tenantSlug?: string) => {
    if (sessionToken) {
      const url = tenantSlug
        ? `${API_BASE}/api/auth/logout?tenant=${tenantSlug}`
        : `${API_BASE}/api/auth/logout?tenant=maplewood-vt`;
      fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionToken}` },
      }).catch(() => {});
    }
    sessionToken = null;
    sessionRole = null;
    sessionEmail = null;
    setIsAuthenticated(false);
    setRole(null);
    setEmail(null);
    setError(null);
  }, []);

  const getToken = useCallback(() => sessionToken, []);
  const isPlatformAdmin = useCallback(() => sessionRole === "platform", []);

  return React.createElement(
    AuthContext.Provider,
    { value: { isAuthenticated, isLoading, error, role, email, login, platformLogin, logout, getToken, isPlatformAdmin } },
    children
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
