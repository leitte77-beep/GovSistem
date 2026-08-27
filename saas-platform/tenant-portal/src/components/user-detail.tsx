"use client";
import { useEffect, useState } from "react";
import { X, KeyRound, ShieldCheck, UserCog, Eye, Power, RotateCcw, History, LogOut } from "lucide-react";
import api from "@/lib/api";
import { formatDateTime, initials } from "@/lib/format";

interface UserDetail {
  user_id: string;
  membership_id: string;
  name: string;
  email: string;
  cpf?: string | null;
  phone?: string | null;
  position?: string | null;
  department?: string | null;
  global_active: boolean;
  membership_role: string;
  membership_active: boolean;
  created_at?: string | null;
}

interface Props {
  user: UserDetail;
  onClose: () => void;
  onChanged: () => void;
}

export default function UserDetailDrawer({ user, onClose, onChanged }: Props) {
  const [grants, setGrants] = useState<Record<string, string[]>>({});
  const [audit, setAudit] = useState<Array<{ action: string; actor_email?: string | null; created_at?: string | null }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api<{ grants: Record<string, string[]> }>(`/tenant/users/${user.user_id}/grants`),
      api<{ data: Array<{ action: string; actor_email?: string | null; created_at?: string | null }> }>(
        `/tenant/users/${user.user_id}/audit?per_page=8`
      ),
    ])
      .then(([g, a]) => {
        setGrants(g.grants);
        setAudit(a.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user.user_id]);

  const actionBtn =
    "inline-flex items-center gap-1 rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-medium text-on-surface hover:bg-surface-container-low";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="flex h-full w-full max-w-md flex-col bg-surface-container-lowest shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-lg font-semibold text-on-surface">Detalhes do usuário</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-on-surface-variant hover:bg-surface-container" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-auto px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-600 text-lg font-semibold text-white">
              {initials(user.name)}
            </div>
            <div>
              <p className="font-semibold text-on-surface">{user.name}</p>
              <p className="text-sm text-on-surface-variant">{user.email}</p>
              <div className="mt-1 flex items-center gap-1.5">
                {user.membership_role === "ORG_ADMIN" && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
                    <ShieldCheck size={12} /> Gestor
                  </span>
                )}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    user.membership_active ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
                  }`}
                >
                  {user.membership_active ? "Ativo" : "Suspenso"}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-xl border p-4 text-sm">
            <div>
              <p className="text-xs text-on-surface-variant">Cargo</p>
              <p className="font-medium text-on-surface">{user.position ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-on-surface-variant">Departamento</p>
              <p className="font-medium text-on-surface">{user.department ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-on-surface-variant">Telefone</p>
              <p className="font-medium text-on-surface">{user.phone ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-on-surface-variant">Vínculo desde</p>
              <p className="font-medium text-on-surface">{formatDateTime(user.created_at)}</p>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-on-surface">Módulos e roles</h3>
            {loading ? (
              <p className="text-sm text-on-surface-variant">Carregando...</p>
            ) : Object.keys(grants).length === 0 ? (
              <p className="rounded-lg bg-surface-container-low px-3 py-2 text-sm text-on-surface-variant">
                Nenhum acesso concedido.
              </p>
            ) : (
              <div className="space-y-2">
                {Object.entries(grants).map(([slug, roles]) => (
                  <div key={slug} className="rounded-lg border px-3 py-2">
                    <p className="text-sm font-medium capitalize text-on-surface">{slug}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {roles.map((r) => (
                        <span key={r} className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
                          {r}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-on-surface">Últimos eventos</h3>
            {audit.length === 0 ? (
              <p className="rounded-lg bg-surface-container-low px-3 py-2 text-sm text-on-surface-variant">Sem eventos recentes.</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {audit.map((a) => (
                  <li key={a.created_at ?? a.action} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="font-medium text-on-surface">{a.action.replace(/_/g, " ")}</span>
                    <span className="text-xs text-on-surface-variant">{formatDateTime(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t px-5 py-4">
          <button className={actionBtn}>
            <UserCog size={13} /> Acessos
          </button>
          <button className={actionBtn}>
            <KeyRound size={13} /> Redefinir senha
          </button>
          <button className={actionBtn}>
            <LogOut size={13} /> Revogar sessões
          </button>
          <button className={actionBtn}>
            <History size={13} /> Histórico
          </button>
          <button className={actionBtn}>
            <Eye size={13} /> Ver detalhes
          </button>
          {user.membership_active ? (
            <button className={`${actionBtn} border-red-200 text-red-600`}>
              <Power size={13} /> Suspender
            </button>
          ) : (
            <button className={`${actionBtn} border-green-200 text-green-700`}>
              <RotateCcw size={13} /> Ativar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
