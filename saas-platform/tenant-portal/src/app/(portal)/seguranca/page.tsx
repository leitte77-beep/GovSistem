"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, ShieldCheck, Smartphone, LogOut, CheckCircle2, AlertTriangle, RefreshCcw } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth-provider";
import { formatDateTime } from "@/lib/format";

interface SecurityInfo {
  organization_slug: string;
  membership_role: string;
  membership_active: boolean;
  global_active: boolean;
  mfa_enabled: boolean;
  force_password_reset: boolean;
  password_changed_at?: string | null;
}

interface SessionRow {
  id: string;
  module_slug?: string | null;
  expires_at?: string | null;
  used_at?: string | null;
  redirect_url?: string | null;
  is_active: boolean;
}

export default function SecurityPage() {
  const { ctx } = useAuth();
  const [info, setInfo] = useState<SecurityInfo | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setError("");
    try {
      const [sec, sess] = await Promise.all([
        api<SecurityInfo>("/tenant/security"),
        api<{ data: SessionRow[] }>("/tenant/sessions?limit=100"),
      ]);
      setInfo(sec);
      setSessions(sess.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar segurança");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const revokeAll = async () => {
    if (!confirm("Encerrar todas as sessões ativas deste órgão?")) return;
    setBusy(true);
    setError("");
    try {
      const me = ctx?.user.id;
      if (me) await api(`/tenant/users/${me}/revoke-sessions`, { method: "POST" });
      setSessions([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao revogar sessões");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-on-surface">Segurança</h1>
        <p className="text-sm text-on-surface-variant">Senha, sessões e postura de segurança da sua conta.</p>
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-surface-container-lowest p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 font-medium text-on-surface">
            <KeyRound size={18} className="text-primary-700" /> Senha
          </h2>
          <p className="mb-1 text-sm text-on-surface-variant">
            Última alteração: {formatDateTime(info?.password_changed_at)}
          </p>
          {info?.force_password_reset && (
            <p className="mb-3 flex items-center gap-1 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
              <AlertTriangle size={14} /> Você deve trocar a senha no próximo acesso.
            </p>
          )}
          <Link
            href="/trocar-senha"
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700"
          >
            <KeyRound size={15} /> Alterar senha
          </Link>
        </div>

        <div className="rounded-xl border bg-surface-container-lowest p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 font-medium text-on-surface">
            <ShieldCheck size={18} className="text-primary-700" /> Postura da conta
          </h2>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-on-surface-variant">Vínculo</span>
              <span className="font-medium text-on-surface">
                {info?.membership_active ? "Ativo" : "Inativo"}
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-on-surface-variant">Perfil</span>
              <span className="font-medium text-on-surface">
                {info?.membership_role === "ORG_ADMIN" ? "Gestor" : "Usuário"}
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-on-surface-variant">Autenticação em dois fatores (MFA)</span>
              {info?.mfa_enabled ? (
                <span className="inline-flex items-center gap-1 font-medium text-green-700">
                  <CheckCircle2 size={14} /> Ativado
                </span>
              ) : (
                <span className="rounded-full bg-surface-container px-2 py-0.5 text-xs text-on-surface-variant">Disponível em breve</span>
              )}
            </li>
          </ul>
        </div>
      </div>

      <div className="rounded-xl border bg-surface-container-lowest p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-medium text-on-surface">
            <Smartphone size={18} className="text-primary-700" /> Sessões ativas
          </h2>
          {sessions.length > 0 && (
            <button
              onClick={revokeAll}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              <LogOut size={13} /> {busy ? "Revogando..." : "Encerrar todas"}
            </button>
          )}
        </div>

        {sessions.length === 0 ? (
          <p className="flex items-center gap-2 rounded-lg bg-surface-container-low px-3 py-4 text-sm text-on-surface-variant">
            <RefreshCcw size={15} className="opacity-40" /> Nenhuma sessão de módulo ativa.
          </p>
        ) : (
          <ul className="divide-y">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p className="font-medium capitalize text-on-surface">{s.module_slug ?? "Portal"}</p>
                  <p className="text-xs text-on-surface-variant">Expira em {formatDateTime(s.expires_at)}</p>
                </div>
                <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">Ativa</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
