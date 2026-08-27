"use client";
import React, { useCallback, useEffect, useState } from "react";
import { ScrollText, ChevronLeft, ChevronRight, Search } from "lucide-react";
import api from "@/lib/api";
import { actionLabel, resourceLabel, formatDateTime } from "@/lib/format";

interface AuditRow {
  id: string;
  action: string;
  actor_email?: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
  details?: Record<string, unknown> | null;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at?: string | null;
}

const ACTIONS = [
  "login",
  "module_access",
  "user_create",
  "membership_create",
  "membership_update",
  "membership_profile_update",
  "membership_suspended",
  "membership_activated",
  "membership_removed",
  "membership_restored",
  "grants_update",
  "grant_created",
  "grant_removed",
  "password_reset_requested",
  "force_password_reset",
  "password_changed",
  "sessions_revoked",
];

export default function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("all");
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const perPage = 50;

  const load = useCallback(async () => {
    setError("");
    try {
      const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
      if (actionFilter !== "all") params.set("action", actionFilter);
      if (q) params.set("q", q);
      const r = await api<{ data: AuditRow[]; total: number; page: number; per_page: number }>(
        `/tenant/audit?${params.toString()}`
      );
      setRows(r.data);
      setTotal(r.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar auditoria");
    }
  }, [page, actionFilter, q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const safeDetails = (d: Record<string, unknown> | null | undefined) => {
    if (!d) return null;
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(d)) {
      if (["password", "password_hash", "token", "secret", "reset_token"].includes(k.toLowerCase())) continue;
      cleaned[k] = v;
    }
    return cleaned;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-on-surface">Auditoria</h1>
        <p className="text-sm text-on-surface-variant">Registro das ações realizadas no órgão.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-2.5 text-on-surface-variant" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar por ator ou ação..."
            aria-label="Buscar na auditoria"
            className="w-full max-w-sm rounded-lg border border-outline-variant py-2 pl-9 pr-3 text-sm outline-none focus:border-primary-600"
          />
        </div>
        <select
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filtrar por ação"
          className="rounded-lg border border-outline-variant px-3 py-2 text-sm outline-none focus:border-primary-600"
        >
          <option value="all">Ação: todas</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {actionLabel(a)}
            </option>
          ))}
        </select>
        {(actionFilter !== "all" || q) && (
          <button
            onClick={() => {
              setActionFilter("all");
              setQ("");
              setPage(1);
            }}
            className="rounded-lg border border-outline-variant px-3 py-2 text-sm font-medium text-on-surface hover:bg-surface-container-low"
          >
            Limpar
          </button>
        )}
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-xl border bg-surface-container-lowest shadow-sm">
        <table className="min-w-full divide-y text-sm">
          <thead className="bg-surface-container-low text-left text-xs uppercase text-on-surface-variant">
            <tr>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Ator</th>
              <th className="px-4 py-3">Ação</th>
              <th className="px-4 py-3">Recurso</th>
              <th className="px-4 py-3">Resultado</th>
              <th className="px-4 py-3">Detalhes</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => {
              const details = safeDetails(r.details);
              return (
                <React.Fragment key={r.id}>
                  <tr className={expanded === r.id ? "bg-primary-50/40" : ""}>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-on-surface-variant">
                      {formatDateTime(r.created_at)}
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">{r.actor_email ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-on-surface">{actionLabel(r.action)}</span>
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">
                      {resourceLabel(r.resource_type)}
                      {r.resource_id ? <span className="text-xs"> · {r.resource_id.slice(0, 8)}</span> : null}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                        Sucesso
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {details ? (
                        <button
                          onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                          className="text-xs font-medium text-primary-700 hover:underline"
                        >
                          {expanded === r.id ? "Ocultar" : "Ver"}
                        </button>
                      ) : (
                        <span className="text-xs text-on-surface-variant">—</span>
                      )}
                    </td>
                  </tr>
                  {expanded === r.id && details && (
                    <tr className="bg-primary-50/30">
                      <td colSpan={6} className="px-6 py-3 text-xs text-on-surface">
                        <pre className="whitespace-pre-wrap font-mono text-xs">{JSON.stringify(details, null, 2)}</pre>
                        {r.ip_address && <p className="mt-2 text-on-surface-variant">IP: {r.ip_address}</p>}
                        {r.user_agent && <p className="truncate text-on-surface-variant">Agente: {r.user_agent}</p>}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-on-surface-variant">
                  <ScrollText size={24} className="mx-auto mb-2 opacity-40" />
                  Nenhum registro de auditoria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-on-surface-variant">
            Página {page} de {totalPages} · {total} registros
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 rounded-lg border border-outline-variant px-3 py-1 text-xs font-medium text-on-surface hover:bg-surface-container-low disabled:opacity-40"
            >
              <ChevronLeft size={14} /> Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex items-center gap-1 rounded-lg border border-outline-variant px-3 py-1 text-xs font-medium text-on-surface hover:bg-surface-container-low disabled:opacity-40"
            >
              Próxima <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
