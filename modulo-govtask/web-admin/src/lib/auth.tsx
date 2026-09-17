"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { api, AuthError, bootstrapTokenFromQuery } from "./api";

interface User {
  id: string;
  email: string;
  name: string;
  roles: { id: string; name: string; label: string }[];
  permissions?: string[];
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => void;
  refreshAuth: () => Promise<void>;
  hasRole: (...roles: string[]) => boolean;
  hasPermission: (...perms: string[]) => boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: () => {},
  refreshAuth: async () => {},
  hasRole: () => false,
  hasPermission: () => false,
});

const ACCESS_TOKEN_KEY = "govtask_access_token";

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

  const logout = () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
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

  const hasPermission = (...perms: string[]) => {
    if (!user?.permissions) return false;
    return perms.some((p) => user.permissions!.includes(p));
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout, refreshAuth, hasRole, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
