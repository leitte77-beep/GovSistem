"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { api, bootstrapTokenFromQuery, SAAS_URL, type MeResponse } from "./api";

interface AuthContextType {
  user: MeResponse | null;
  loading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    const token = bootstrapTokenFromQuery() || sessionStorage.getItem("govpro_access_token");
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const u = await api.me();
      setUser(u);
    } catch {
      sessionStorage.removeItem("govpro_access_token");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    const handleLogout = () => setUser(null);
    window.addEventListener("auth:logout", handleLogout);
    return () => window.removeEventListener("auth:logout", handleLogout);
  }, []);

  const logout = () => {
    sessionStorage.removeItem("govpro_access_token");
    setUser(null);
    window.location.href = SAAS_URL;
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
