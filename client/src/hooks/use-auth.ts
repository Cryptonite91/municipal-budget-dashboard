import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import React from "react";
import { API_BASE } from "@/lib/api-base";

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (password: string, tenantSlug: string) => Promise<boolean>;
  logout: (tenantSlug: string) => void;
  getToken: () => string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Module-level token storage (survives re-renders, cleared on page reload)
let sessionToken: string | null = null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (password: string, tenantSlug: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login?tenant=${tenantSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid password");
        setIsLoading(false);
        return false;
      }
      sessionToken = data.token;
      setIsAuthenticated(true);
      setIsLoading(false);
      return true;
    } catch {
      setError("Login failed. Please try again.");
      setIsLoading(false);
      return false;
    }
  }, []);

  const logout = useCallback((tenantSlug: string) => {
    if (sessionToken) {
      fetch(`${API_BASE}/api/auth/logout?tenant=${tenantSlug}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionToken}` },
      }).catch(() => {});
    }
    sessionToken = null;
    setIsAuthenticated(false);
    setError(null);
  }, []);

  const getToken = useCallback(() => sessionToken, []);

  return React.createElement(
    AuthContext.Provider,
    { value: { isAuthenticated, isLoading, error, login, logout, getToken } },
    children
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
