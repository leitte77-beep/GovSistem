"use client";
import { useCallback, useEffect, useState } from "react";
import { Blocks, Users, RefreshCcw, AlertTriangle } from "lucide-react";
import api from "@/lib/api";
import GrantsModal from "@/components/grants-modal";
import PendingReviewPanel from "@/components/pending-review-panel";

interface ContractedModule {
  slug: string;
  name: string;
  roles: Array<{ name: string; label: string }>;
}

interface ModuleUser {
  user_id: string;
  membership_id: string;
  name: string;
  email: string;
  membership_active: boolean;
  roles: string[];
  requires_review?: boolean;
}

interface PendingGrantsResponse {
  total: number;
  modules: Array<{ slug: string; name: string; count: number }>;
}

export default function AccessPage() {
  const [modules, setModules] = useState<ContractedModule[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [users, setUsers] = useState<ModuleUser[]>([]);
  const [loadingModules, setLoadingModules] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [grantsFor, setGrantsFor] = useState<{ user_id: string; name: string } | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<PendingGrantsResponse | null>(null);
  const [showPanel, setShowPanel] = useState(false);

  useEffect(() => {
    api<ContractedModule[]>("/tenant/roles")
      .then((mods) => {
        setModules(mods);
        if (mods.length && !selected) setSelected(mods[0].slug);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Falha ao carregar módulos"))
      .finally(() => setLoadingModules(false));
  }, [selected]);

  const loadPending = useCallback(async () => {
    try {
      const r = await api<PendingGrantsResponse>("/tenant/pending-grants");
      setPending(r);
    } catch {
      setPending(null);
    }
  }, []);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  const loadUsers = useCallback(async (slug: string) => {
    setLoadingUsers(true);
    setError("");
    try {
      const r = await api<{ users: ModuleUser[] }>(`/tenant/modules/${slug}/users`);
      setUsers(r.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar usuários");
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    if (selected) loadUsers(selected);
  }, [selected, loadUsers]);

  const activeModule = modules.find((m) => m.slug === selected);
  const pendingTotal = pending?.total ?? 0;

  const onPanelChange = () => {
    if (selected) loadUsers(selected);
    loadPending();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">Acessos e permissões</h1>
          <p className="text-sm text-on-surface-variant">
            Distribua módulos e roles aos usuários, organizado por módulo contratado.
          </p>
        </div>
        {pendingTotal > 0 && (
          <button
            onClick={() => setShowPanel(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 px-4 py-2.5 text-sm font-semibold text-amber-900 shadow-sm transition hover:from-amber-100 hover:to-orange-100"
          >
            <AlertTriangle size={16} className="text-amber-700" />
            {pendingTotal} grant{pendingTotal === 1 ? "" : "s"} aguardando revisão
            <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900">
              Rever agora
            </span>
          </button>
        )}
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <h2 className="mb-3 text-sm font-semibold text-on-surface">Módulos contratados</h2>
          {loadingModules ? (
            <p className="rounded-xl border bg-surface-container-lowest p-4 text-sm text-on-surface-variant">Carregando módulos...</p>
          ) : (
            <div className="space-y-2">
              {modules.map((m) => {
                const modPending = pending?.modules.find((p) => p.slug === m.slug)?.count ?? 0;
                return (
                  <button
                    key={m.slug}
                    onClick={() => setSelected(m.slug)}
                    className={`flex w-full items-center gap-3 rounded-xl border bg-surface-container-lowest px-4 py-3 text-left text-sm transition ${
                      selected === m.slug ? "border-primary-600 bg-primary-50" : "hover:bg-surface-container-low"
                    }`}
                  >
                    <Blocks size={18} className="shrink-0 text-primary-700" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-on-surface">{m.name}</span>
                      <span className="block text-xs text-on-surface-variant">{m.roles.length} roles disponíveis</span>
                    </span>
                    {modPending > 0 && (
                      <span
                        title={`${modPending} grants pendentes neste módulo`}
                        className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-amber-200"
                      >
                        <AlertTriangle size={10} /> {modPending}
                      </span>
                    )}
                  </button>
                );
              })}
              {modules.length === 0 && (
                <p className="rounded-xl border bg-surface-container-lowest p-4 text-sm text-on-surface-variant">
                  Nenhum módulo contratado com roles configuráveis.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-xl border bg-surface-container-lowest shadow-sm">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <h2 className="font-semibold text-on-surface">{activeModule?.name ?? "Selecione um módulo"}</h2>
                <p className="text-sm text-on-surface-variant">{users.length} usuários com acesso</p>
              </div>
              {selected && (
                <button
                  onClick={() => loadUsers(selected)}
                  className="rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-medium text-on-surface hover:bg-surface-container-low"
                >
                  <RefreshCcw size={13} className="mr-1 inline" /> Atualizar
                </button>
              )}
            </div>

            {loadingUsers ? (
              <p className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-on-surface-variant">
                <RefreshCcw size={15} className="animate-spin" /> Carregando usuários...
              </p>
            ) : users.length === 0 ? (
              <p className="flex items-center justify-center gap-2 px-5 py-10 text-sm text-on-surface-variant">
                <Users size={18} className="opacity-40" /> Nenhum usuário com acesso a este módulo.
              </p>
            ) : (
              <div className="divide-y">
                {users.map((u) => (
                  <div key={u.user_id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-on-surface">{u.name}</p>
                      <p className="truncate text-xs text-on-surface-variant">{u.email}</p>
                      {u.requires_review && (
                        <span className="mt-1 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                          Acesso legado em revisão
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {u.roles.length > 0 && (
                        <div className="flex flex-wrap justify-end gap-1">
                          {u.roles.map((r) => (
                            <span key={r} className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700">
                              {r}
                            </span>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={() => setGrantsFor({ user_id: u.user_id, name: u.name })}
                        className="rounded-lg border border-outline-variant px-2 py-1 text-xs font-medium text-on-surface hover:bg-surface-container-low"
                      >
                        Gerenciar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {grantsFor && (
        <GrantsModal
          userId={grantsFor.user_id}
          userName={grantsFor.name}
          onClose={() => setGrantsFor(null)}
          onSaved={() => {
            setGrantsFor(null);
            onPanelChange();
          }}
        />
      )}

      <PendingReviewPanel
        open={showPanel}
        onClose={() => setShowPanel(false)}
        onChange={onPanelChange}
        onReviewUser={(userId, userName) => {
          setShowPanel(false);
          setGrantsFor({ user_id: userId, name: userName });
        }}
      />
    </div>
  );
}
