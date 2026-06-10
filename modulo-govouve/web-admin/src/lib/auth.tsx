"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { api, AuthError, bootstrapTokenFromQuery } from "./api";

interface User {
  id: string;
  email: string;
  name: string;
  roles: { id: string; name: string; label: string }[];
  organization_id?: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshAuth: () => Promise<void>;
  hasRole: (...roles: string[]) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  logout: () => {},
  refreshAuth: async () => {},
  hasRole: () => false,
});

const ACCESS_TOKEN_KEY = "govouve_access_token";
const REFRESH_TOKEN_KEY = "govouve_refresh_token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const urlToken = bootstrapTokenFromQuery();
      const token = urlToken || localStorage.getItem(ACCESS_TOKEN_KEY);
      if (!token) {
        setLoading(false);
        return;
      }
      const userData = await api.me();
      setUser(userData);
    } catch (e) {
      if (e instanceof AuthError) {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();

    const handleLogout = () => setUser(null);
    window.addEventListener("auth:logout", handleLogout);
    return () => window.removeEventListener("auth:logout", handleLogout);
  }, [fetchUser]);

  const login = async (email: string, password: string) => {
    const tokens = await api.login(email, password);
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
    await fetchUser();
  };

  const logout = () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setUser(null);
  };

  const refreshAuth = async () => {
    setLoading(true);
    await fetchUser();
  };

  const hasRole = (...roles: string[]) => {
    if (!user) return false;
    return user.roles.some((r) => roles.includes(r.name));
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshAuth, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
