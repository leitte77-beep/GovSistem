import React, { createContext, useContext, useState, useCallback } from 'react';

const AuthContext = createContext(null);

const STORAGE_KEY = 'chatgov_auth';
const DEV_SAAS_LOGIN_ENABLED =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_SAAS_LOGIN === 'true';

function mapRolesToPapel(roles) {
  if (!Array.isArray(roles)) return 'operador';
  if (roles.some((r) => ['SUPER_ADMIN', 'PLATFORM_ADMIN', 'ADMIN'].includes(r))) {
    return 'admin';
  }
  if (roles.includes('SUPPORT')) {
    return 'supervisor';
  }
  return 'operador';
}

// Constrói o objeto de auth a partir do token (fonte única de verdade).
function buildAuthFromToken(token) {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const papel = payload.papel || payload.role || mapRolesToPapel(payload.roles);
    return {
      token,
      operador: {
        id: payload.sub,
        nome: payload.name || payload.nome || '',
        email: payload.email || '',
        papel,
        tenantId: payload.organization_id || payload.tenantId || payload.tenant_id,
        tenantNome: payload.org_name || payload.tenant_name || '',
        tenantSlug: payload.org_slug || payload.tenant_slug || '',
      },
    };
  } catch {
    return null;
  }
}

function parseTokenFromURL() {
  try {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      const authData = buildAuthFromToken(token);
      if (authData) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(authData));
        window.history.replaceState({}, '', window.location.pathname);
        return authData;
      }
    }
  } catch {}
  return null;
}

function loadStoredAuth() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    // Re-deriva o papel a partir do token, corrigindo caches antigos.
    const rebuilt = buildAuthFromToken(parsed.token);
    if (rebuilt) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rebuilt));
      return rebuilt;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => parseTokenFromURL() || loadStoredAuth());

  React.useEffect(() => {
    const urlAuth = parseTokenFromURL();
    if (urlAuth && urlAuth.token !== auth?.token) {
      setAuth(urlAuth);
    }
  }, []);

  const loginWithSaas = useCallback(async (email, password) => {
    if (!DEV_SAAS_LOGIN_ENABLED) {
      throw new Error('Login de desenvolvimento indisponível');
    }

    const loginResponse = await fetch('/saas-api/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const loginData = await loginResponse.json().catch(() => ({}));
    if (!loginResponse.ok || !loginData.access_token) {
      throw new Error(loginData.detail || 'E-mail ou senha inválidos');
    }

    const sessionResponse = await fetch('/api/dev/saas/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: loginData.access_token }),
    });
    const sessionData = await sessionResponse.json().catch(() => ({}));
    if (!sessionResponse.ok || !sessionData.token) {
      throw new Error(sessionData.erro || 'Não foi possível abrir o ChatGov dev');
    }

    const authData = buildAuthFromToken(sessionData.token);
    if (!authData) throw new Error('Sessão de desenvolvimento inválida');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(authData));
    setAuth(authData);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setAuth(null);
    window.location.href = DEV_SAAS_LOGIN_ENABLED ? '/' : 'https://admin.govsistem.com.br/';
  }, []);

  return React.createElement(AuthContext.Provider, {
    value: { auth, logout, loginWithSaas, devSaasLoginEnabled: DEV_SAAS_LOGIN_ENABLED },
  }, children);
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
