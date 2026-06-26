import React, { createContext, useContext, useState, useCallback } from 'react';

const AuthContext = createContext(null);

const STORAGE_KEY = 'chatgov_auth';

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

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setAuth(null);
    window.location.href = 'https://admin.govsistem.com.br/';
  }, []);

  return React.createElement(AuthContext.Provider, { value: { auth, logout } }, children);
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
