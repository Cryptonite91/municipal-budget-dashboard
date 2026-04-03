import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import React from "react";

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (password: string) => Promise<boolean>;
  logout: () => void;
  getToken: () => string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Module-level token storage (survives re-renders, cleared on page reload)
let sessionToken: string | null = null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (password: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
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
    } catch (err: any) {
      setError("Login failed. Please try again.");
      setIsLoading(false);
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    if (sessionToken) {
      fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionToken}`,
        },
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
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
