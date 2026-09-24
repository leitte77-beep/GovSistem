import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, sessao as armazenamento, URL_GOVSISTEM } from '../api/cliente';
import type { Sessao } from '../types';

// Em produção o usuário chega pela plataforma: `?token=<module_access>` na URL.
// Em desenvolvimento (VITE_ENABLE_SAAS_LOGIN) também é possível entrar com a
// conta do GovSistem pela ponte `/auth/dev/session`.
const LOGIN_SAAS_DEV = import.meta.env.DEV && import.meta.env.VITE_ENABLE_SAAS_LOGIN === 'true';

type Valor = {
  dados: Sessao | null;
  carregando: boolean;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
  recarregar: () => Promise<void>;
  loginSaasDev: boolean;
  pode: (...permissoes: string[]) => boolean;
};

const Contexto = createContext<Valor | null>(null);

function extrairTokenDaUrl(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      armazenamento.gravar(token);
      window.history.replaceState({}, '', window.location.pathname);
      return token;
    }
  } catch { /* URL inválida: segue sem token */ }
  return null;
}

export function ProvedorSessao({ children }: { children: React.ReactNode }) {
  const [dados, setDados] = useState<Sessao | null>(null);
  const [carregando, setCarregando] = useState(true);

  const recarregar = useCallback(async () => {
    if (!armazenamento.token()) { setDados(null); setCarregando(false); return; }
    try { setDados(await api.get<Sessao>('/auth/eu')); }
    catch { armazenamento.limpar(); setDados(null); }
    finally { setCarregando(false); }
  }, []);

  useEffect(() => { extrairTokenDaUrl(); void recarregar(); }, [recarregar]);

  async function entrar(email: string, senha: string) {
    if (!LOGIN_SAAS_DEV) {
      window.location.href = URL_GOVSISTEM;
      return;
    }
    // Login de desenvolvimento: autentica na API do GovSistem e troca o
    // access_token por uma sessão do GovInfra (ponte /auth/dev/session).
    const loginResposta = await fetch('/saas-api/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: senha }),
    });
    const loginDados = await loginResposta.json().catch(() => ({}));
    if (!loginResposta.ok || !loginDados.access_token) {
      throw new Error(loginDados.detail || 'E-mail ou senha inválidos');
    }
    const sessaoResposta = await api.post<any>('/auth/dev/session', {
      access_token: loginDados.access_token,
    });
    if (!sessaoResposta.token) {
      throw new Error('Não foi possível abrir a sessão de desenvolvimento');
    }
    armazenamento.gravar(sessaoResposta.token);
    await recarregar();
  }

  async function sair() {
    armazenamento.limpar(); setDados(null);
    // Em produção o logout volta para a plataforma GovSistem.
    window.location.href = LOGIN_SAAS_DEV ? '/' : URL_GOVSISTEM;
  }

  const pode = useCallback(
    (...permissoes: string[]) => {
      if (!dados) return false;
      return permissoes.every((p) => dados.permissoes.includes(p));
    },
    [dados],
  );

  const valor = useMemo(
    () => ({ dados, carregando, entrar, sair, recarregar, loginSaasDev: LOGIN_SAAS_DEV, pode }),
    [dados, carregando, recarregar, pode],
  );
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSessao() {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useSessao deve estar dentro do ProvedorSessao');
  return valor;
}
