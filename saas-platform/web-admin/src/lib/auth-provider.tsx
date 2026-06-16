"use client";
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import api, { setToken, clearToken, getStoredToken } from "./api";

interface User {
  id: string;
  name: string;
  email: string;
  is_platform_admin: boolean;
  is_organization_admin: boolean;
  platform_role: string | null;
  organization_id: string | null;
  is_active: boolean;
  mfa_enabled: boolean;
  module_permissions?: string[];
  cpf?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  created_at?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  logout: () => {},
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const data = await api<User>("/auth/me");
      setUser(data);
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (getStoredToken()) fetchUser();
    else setLoading(false);
  }, [fetchUser]);

  const login = async (email: string, password: string) => {
    const data = await api<{ access_token: string; refresh_token: string }>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setToken(data.access_token);
    setLoading(true);
    await fetchUser();
  };

  const logout = () => {
    clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser: fetchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
