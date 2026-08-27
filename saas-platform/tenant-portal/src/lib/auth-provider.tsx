"use client";
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import api, { setToken, clearToken, getStoredToken } from "./api";

export interface TenantUser {
  id: string;
  name: string;
  email: string;
  profile: string;
  is_manager: boolean;
}

export interface TenantOrg {
  id: string;
  slug: string;
  name: string;
  logo_url?: string | null;
  is_active: boolean;
}

export interface ModuleCard {
  slug: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  version: string;
  is_active: boolean;
  available: boolean;
  authorized: boolean;
  requires_review?: boolean;
  module_url?: string | null;
  unavailable_reason?: string | null;
}

export interface TenantContextData {
  organization: TenantOrg;
  user: TenantUser;
  modules: ModuleCard[];
  feature_flags?: { tenant_portal?: boolean; sso_code_launch?: boolean };
}

interface AuthContextType {
  ctx: TenantContextData | null;
  loading: boolean;
  organizations: TenantOrg[];
  noTenant: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  switchTenant: (organizationId: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  ctx: null,
  loading: true,
  organizations: [],
  noTenant: false,
  login: async () => {},
  logout: () => {},
  refresh: async () => {},
  switchTenant: async () => {},
  changePassword: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ctx, setCtx] = useState<TenantContextData | null>(null);
  const [organizations, setOrganizations] = useState<TenantOrg[]>([]);
  const [noTenant, setNoTenant] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchContext = useCallback(async () => {
    try {
      const data = await api<TenantContextData>("/tenant/context");
      setCtx(data);
      setNoTenant(false);
    } catch (err) {
      // Usuário autenticado mas sem membership ativo -> mensagem clara, mantém sessão.
      if (err instanceof Error && /no active membership|sem v[íi]nculo ativo|membership/i.test(err.message)) {
        setCtx(null);
        setNoTenant(true);
      } else {
        clearToken();
        setCtx(null);
        setNoTenant(false);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOrganizations = useCallback(async () => {
    try {
      const orgs = await api<TenantOrg[]>("/tenant/organizations");
      setOrganizations(orgs);
    } catch {
      setOrganizations([]);
    }
  }, []);

  useEffect(() => {
    if (getStoredToken()) {
      fetchContext();
      loadOrganizations();
    } else {
      setLoading(false);
    }
  }, [fetchContext, loadOrganizations]);

  const login = async (email: string, password: string) => {
    const data = await api<{ access_token: string; force_password_reset?: boolean }>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setToken(data.access_token);
    setLoading(true);
    await Promise.all([fetchContext(), loadOrganizations()]);
    router.push(data.force_password_reset ? "/trocar-senha" : "/dashboard");
  };

  const logout = () => {
    clearToken();
    setCtx(null);
    setOrganizations([]);
    setNoTenant(false);
    router.push("/login");
  };

  const switchTenant = async (organizationId: string) => {
    const data = await api<{ access_token: string }>("/auth/switch-tenant", {
      method: "POST",
      body: { organization_id: organizationId },
    });
    setToken(data.access_token);
    setLoading(true);
    await Promise.all([fetchContext(), loadOrganizations()]);
    router.push("/dashboard");
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    await api("/auth/change-password", {
      method: "POST",
      body: { current_password: currentPassword, new_password: newPassword },
    });
  };

  return (
    <AuthContext.Provider
      value={{ ctx, loading, organizations, noTenant, login, logout, refresh: fetchContext, switchTenant, changePassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
