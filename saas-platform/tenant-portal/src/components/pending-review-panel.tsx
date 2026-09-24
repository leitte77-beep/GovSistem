"use client";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  X,
  Check,
  CheckCircle2,
  Loader2,
  Blocks,
  User as UserIcon,
  ChevronRight,
  ChevronDown,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import api from "@/lib/api";
import { useToast } from "@/components/toast";
import { actionLabel } from "@/lib/format";
import { moduleVisual } from "@/components/module-card";
import type { LucideIcon } from "lucide-react";

interface PendingItem {
  grant_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  membership_id: string;
  role_name: string;
  source: string;
  created_at: string | null;
}

interface PendingModule {
  slug: string;
  name: string;
  version: string;
  count: number;
  items: PendingItem[];
}

interface PendingGrantsResponse {
  total: number;
  modules: PendingModule[];
}

interface PendingReviewPanelProps {
  open: boolean;
  onClose: () => void;
  onChange?: () => void;
  onReviewUser?: (userId: string, userName: string) => void;
}

function roleBadge(roleName: string) {
  if (roleName.startsWith("__")) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700 ring-1 ring-amber-200">
        <ShieldAlert size={10} /> Legado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-700 ring-1 ring-blue-200">
      {roleName}
    </span>
  );
}

export default function PendingReviewPanel({
  open,
  onClose,
  onChange,
  onReviewUser,
}: PendingReviewPanelProps) {
  const [data, setData] = useState<PendingGrantsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busyGrant, setBusyGrant] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState<"approve" | "dismiss" | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const r = await api<PendingGrantsResponse>("/tenant/pending-grants");
      setData(r);
      if (r.modules.length && Object.keys(expanded).length === 0) {
        setExpanded({ [r.modules[0].slug]: true });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar pendências");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const approve = async (grantId: string) => {
    setBusyGrant(grantId);
    try {
      await api(`/tenant/pending-grants/${grantId}/approve`, { method: "POST" });
      await load();
      onChange?.();
      toast("success", "Grant aprovado com role segura");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Falha ao aprovar");
    } finally {
      setBusyGrant(null);
    }
  };

  const dismiss = async (grantId: string) => {
    setBusyGrant(grantId);
    try {
      await api(`/tenant/pending-grants/${grantId}/dismiss`, { method: "POST" });
      await load();
      onChange?.();
      toast("success", "Grant rejeitado");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Falha ao rejeitar");
    } finally {
      setBusyGrant(null);
    }
  };

  const approveAll = async () => {
    if (!data || !data.total) return;
    if (!window.confirm(`Aprovar todos os ${data.total} grants pendentes? Cada um receberá a role segura (somente leitura) do seu módulo.`)) {
      return;
    }
    setBusyAll("approve");
    try {
      // approve sequencialmente (cada um é uma transação leve)
      let ok = 0;
      let fail = 0;
      for (const mod of data.modules) {
        for (const it of mod.items) {
          try {
            await api(`/tenant/pending-grants/${it.grant_id}/approve`, { method: "POST" });
            ok++;
          } catch {
            fail++;
          }
        }
      }
      await load();
      onChange?.();
      toast(
        fail ? "error" : "success",
        fail ? `${ok} aprovados, ${fail} falharam` : `${ok} grants aprovados`,
      );
    } finally {
      setBusyAll(null);
    }
  };

  const dismissAll = async () => {
    if (!data || !data.total) return;
    if (!window.confirm(`Rejeitar todos os ${data.total} grants pendentes? Os usuários perderão o acesso legado a esses módulos.`)) {
      return;
    }
    setBusyAll("dismiss");
    try {
      await api(`/tenant/pending-grants/dismiss-all`, { method: "POST" });
      await load();
      onChange?.();
      toast("success", "Pendências rejeitadas em massa");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Falha ao rejeitar");
    } finally {
      setBusyAll(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <button
        type="button"
        aria-label="Fechar painel"
        onClick={onClose}
        className="flex-1 bg-black/40 backdrop-blur-sm"
      />
      <aside className="flex h-full w-full max-w-xl flex-col bg-surface-container-lowest shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-outline-variant bg-gradient-to-br from-amber-50 to-orange-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-700 ring-1 ring-amber-200">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-on-surface">Grants aguardando revisão</h2>
              <p className="text-xs text-on-surface-variant">
                Permissões legadas migradas. Aprove para conceder uma role segura ou rejeite para remover.
              </p>
              {data && (
                <p className="mt-1 text-sm font-semibold text-amber-700">
                  {data.total} pendente{data.total === 1 ? "" : "s"} em {data.modules.length} módulo{data.modules.length === 1 ? "" : "s"}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-on-surface-variant hover:bg-white/60"
          >
            <X size={18} />
          </button>
        </header>

        {data && data.total > 0 && (
          <div className="flex flex-wrap gap-2 border-b border-outline-variant bg-surface-container-low/40 px-5 py-3">
            <button
              onClick={approveAll}
              disabled={busyAll !== null}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
            >
              {busyAll === "approve" ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
              Aprovar todos (role segura)
            </button>
            <button
              onClick={dismissAll}
              disabled={busyAll !== null}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-50 disabled:opacity-60"
            >
              {busyAll === "dismiss" ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
              Rejeitar todos
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5">
          {loading && !data ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-container" />
              ))}
            </div>
          ) : error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</p>
          ) : !data || data.total === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <CheckCircle2 size={22} />
              </div>
              <p className="mt-3 text-sm font-semibold text-emerald-900">Nenhum grant pendente</p>
              <p className="mt-1 max-w-xs text-xs text-emerald-800">
                Todas as permissões legadas já foram revisadas. Você pode fechar este painel.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.modules.map((mod) => {
                const visual = moduleVisual(mod.slug) as { icon: LucideIcon; gradient: string };
                const Icon = visual.icon;
                const isOpen = expanded[mod.slug];
                return (
                  <div
                    key={mod.slug}
                    className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm"
                  >
                    <button
                      onClick={() => setExpanded((p) => ({ ...p, [mod.slug]: !p[mod.slug] }))}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-surface-container-low/60"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${visual.gradient} text-white`}
                        >
                          <Icon size={16} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-on-surface">{mod.name}</p>
                          <p className="text-xs text-on-surface-variant">
                            {mod.count} usuário{mod.count === 1 ? "" : "s"} pendente{mod.count === 1 ? "" : "s"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-amber-200">
                          {mod.count}
                        </span>
                        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </div>
                    </button>

                    {isOpen && (
                      <ul className="divide-y divide-outline-variant border-t border-outline-variant">
                        {mod.items.map((it) => {
                          const isBusy = busyGrant === it.grant_id;
                          return (
                            <li key={it.grant_id} className="px-4 py-3">
                              <div className="flex items-start gap-3">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-container text-on-surface-variant ring-1 ring-outline-variant">
                                  <UserIcon size={14} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold text-on-surface">
                                    {it.user_name}
                                  </p>
                                  <p className="truncate text-xs text-on-surface-variant">
                                    {it.user_email}
                                  </p>
                                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                    {roleBadge(it.role_name)}
                                    <span className="text-[10px] uppercase tracking-wider text-on-surface-variant">
                                      via {actionLabel(it.source)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div className="mt-3 flex flex-wrap justify-end gap-2">
                                {onReviewUser && (
                                  <button
                                    onClick={() => onReviewUser(it.user_id, it.user_name)}
                                    className="rounded-md border border-outline-variant bg-white px-2.5 py-1 text-xs font-medium text-on-surface hover:bg-surface-container-low"
                                  >
                                    Atribuir manualmente
                                  </button>
                                )}
                                <button
                                  onClick={() => dismiss(it.grant_id)}
                                  disabled={isBusy}
                                  className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-60"
                                >
                                  {isBusy ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                                  Rejeitar
                                </button>
                                <button
                                  onClick={() => approve(it.grant_id)}
                                  disabled={isBusy}
                                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                                >
                                  {isBusy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                  Aprovar (role segura)
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <footer className="border-t border-outline-variant bg-surface-container-low/40 px-5 py-3 text-[11px] text-on-surface-variant">
          <p>
            <strong>O que é um grant legado?</strong> Permissão migrada do{" "}
            <code className="rounded bg-surface-container px-1 py-0.5 text-[10px]">users.module_permissions</code>{" "}
            (modelo antigo) sem role concreta no catálogo atual. Aprove para conceder uma role de
            leitura, ou rejeite para remover definitivamente.
          </p>
          <p className="mt-1.5">
            <Link href="/auditoria" className="text-primary-700 hover:underline">
              Ver histórico na auditoria
            </Link>
          </p>
        </footer>
      </aside>
    </div>
  );
}
