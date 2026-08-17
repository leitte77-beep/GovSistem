"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { api, hasCitizenToken, setCitizenToken } from "./api";
import type { CitizenMe } from "@/types/public";

interface CitizenContextType {
  user: CitizenMe | null;
  loading: boolean;
  login: (org_slug: string, email: string, senha: string) => Promise<void>;
  logout: () => void;
}

const CitizenContext = createContext<CitizenContextType | null>(null);

export function CitizenProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CitizenMe | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    if (!hasCitizenToken()) {
      setLoading(false);
      return;
    }
    try {
      const u = await api.me();
      setUser(u);
    } catch {
      setCitizenToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  useEffect(() => {
    const handleLogout = () => setUser(null);
    window.addEventListener("citizen:logout", handleLogout);
    return () => window.removeEventListener("citizen:logout", handleLogout);
  }, []);

  const login = async (org_slug: string, email: string, senha: string) => {
    const { token } = await api.loginCidadao({ org_slug, email, senha });
    setCitizenToken(token);
    const u = await api.me();
    setUser(u);
  };

  const logout = () => {
    setCitizenToken(null);
    setUser(null);
  };

  return (
    <CitizenContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </CitizenContext.Provider>
  );
}

export function useCitizen() {
  const ctx = useContext(CitizenContext);
  if (!ctx) throw new Error("useCitizen must be inside CitizenProvider");
  return ctx;
}
