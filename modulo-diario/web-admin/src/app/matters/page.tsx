"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import type { MatterListItem, MatterStatus, ActType, OrgUnit } from "@/types/matter";
import { api } from "@/lib/api";
import { notifyError } from "@/lib/error-handler";
import { formatDateTime, pluralAnexos } from "@/lib/format";
import { MATTER_STATUSES, MATTER_ACTIONS } from "@/lib/statusConfig";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import ConfirmDialog from "@/components/ConfirmDialog";
import toast from "react-hot-toast";

const PAGE_SIZE = 15;

interface Action {
  key: string;
  label: string;
}

export default function MattersPage() {
  const [matters, setMatters] = useState<MatterListItem[]>([]);
  const [actTypes, setActTypes] = useState<ActType[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [actType, setActType] = useState("");
  const [orgUnit, setOrgUnit] = useState("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const [confirm, setConfirm] = useState<{ type: "archive" | "delete"; matter: MatterListItem } | null>(null);

  useEffect(() => {
    api.listActTypes().then(setActTypes).catch(() => undefined);
    api.listOrgUnits().then(setOrgUnits).catch(() => undefined);
  }, []);

  const activeFilters = useMemo(() =>
    [status && "status", actType && "tipo", orgUnit && "unidade", search && "busca"].filter(Boolean).length,
  [status, actType, orgUnit, search]);

  const actName = useCallback((id: string | null) => actTypes.find((a) => a.id === id)?.name ?? "", [actTypes]);
  const unitName = useCallback((id: string | null) => orgUnits.find((u) => u.id === id)?.name ?? "", [orgUnits]);

  const fetch = useCallback(() => {
    setLoading(true);
    setError(null);
    api.listMatters({
      search: search || undefined,
      status: status || undefined,
      act_type_id: actType || undefined,
      org_unit_id: orgUnit || undefined,
      skip: page * PAGE_SIZE,
      limit: PAGE_SIZE + 1,
    })
      .then((data) => {
        if (data.length > PAGE_SIZE) { setHasMore(true); setMatters(data.slice(0, PAGE_SIZE)); }
        else { setHasMore(false); setMatters(data); }
      })
      .catch((err) => { setError(err instanceof Error ? err.message : "Erro ao carregar matérias"); notifyError("Matters", err); })
      .finally(() => setLoading(false));
  }, [search, status, actType, orgUnit, page]);

  useEffect(() => {
    const t = setTimeout(fetch, search ? 350 : 0);
    return () => clearTimeout(t);
  }, [fetch]);

  useEffect(() => { setPage(0); }, [search, status, actType, orgUnit]);

  const clearFilters = () => { setSearch(""); setStatus(""); setActType(""); setOrgUnit(""); setPage(0); };

  const runConfirm = async () => {
    if (!confirm) return;
    const { type, matter } = confirm;
    setConfirm(null);
    try {
      if (type === "archive") {
        await api.archiveMatter(matter.id);
        toast.success("Matéria arquivada com sucesso");
      } else {
        await api.deleteMatter(matter.id);
        toast.success("Matéria excluída com sucesso");
      }
      setMatters((prev) => prev.filter((m) => m.id !== matter.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro na operação");
    }
  };

  const actionsFor = (status: MatterStatus): Action[] => MATTER_ACTIONS[status] ?? [];

  const rowLink = (id: string) => `/matters/${id}/edit`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Matérias"
        description="Gerenciamento e publicação de atos oficiais"
        actions={
          <Link href="/matters/new" className="inline-flex h-11 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800">
            <Plus size={18} aria-hidden="true" />
            Nova matéria
          </Link>
        }
      />

      {/* Filtros */}
      <section className="mb-5 rounded-xl border border-gray-200 bg-white p-4 shadow-sm" aria-label="Filtros de matérias">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="relative md:col-span-1">
            <span className="sr-only">Buscar por título ou conteúdo</span>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por título ou conteúdo"
              className="h-11 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
            />
          </label>
          <label className="block">
            <span className="sr-only">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/30">
              <option value="">Todos os status</option>
              {Object.entries(MATTER_STATUSES).map(([code, def]) => (
                <option key={code} value={code}>{def.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Tipo de ato</span>
            <select value={actType} onChange={(e) => setActType(e.target.value)} className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/30">
              <option value="">Todos os tipos</option>
              {actTypes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="sr-only">Unidade</span>
            <select value={orgUnit} onChange={(e) => setOrgUnit(e.target.value)} className="h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/30">
              <option value="">Todas as unidades</option>
              {orgUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs text-gray-500">
            {activeFilters > 0 ? `${activeFilters} filtro(s) ativo(s)` : "Sem filtros ativos"}
          </span>
          {activeFilters > 0 && (
            <button onClick={clearFilters} className="text-xs font-semibold text-blue-700 hover:underline">Limpar filtros</button>
          )}
        </div>
      </section>

      {/* Tabela */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {error ? (
          <div className="p-6 text-center text-sm text-red-700" role="alert">Erro ao carregar matérias: {error}</div>
        ) : (
          <>
            <table className="hidden w-full border-collapse text-left md:table">
              <caption className="sr-only">Lista de matérias do Diário Oficial</caption>
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Título</th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Tipo</th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Unidade</th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                  <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">Ver.</th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Atualizada</th>
                  <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-gray-500">Anexos</th>
                  <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={8}><div className="h-12 bg-gray-100" /></td>
                    </tr>
                  ))
                ) : matters.length === 0 ? (
                  <tr><td colSpan={8}><EmptyState title="Nenhuma matéria encontrada" description="Ajuste os filtros ou crie uma nova matéria." /></td></tr>
                ) : matters.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={rowLink(m.id)} className="font-semibold text-blue-700 hover:underline">{m.title}</Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{actName(m.act_type_id)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{unitName(m.org_unit_id)}</td>
                    <td className="px-4 py-3"><StatusBadge kind="matter" status={m.status} size="sm" /></td>
                    <td className="px-4 py-3 text-center text-sm text-gray-700">{m.version}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatDateTime(m.updated_at)}</td>
                    <td className="px-4 py-3 text-center text-sm text-gray-600" title={pluralAnexos(m.attachment_count)}>
                      {m.attachment_count > 0 ? m.attachment_count : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {actionsFor(m.status).map((a) => (
                          <span key={a.key}>
                            {a.key === "edit" || a.key === "fix" || a.key === "review" ? (
                              <Link href={rowLink(m.id)} className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-blue-700 hover:bg-blue-50">{a.label}</Link>
                            ) : a.key === "archive" ? (
                              <button onClick={() => setConfirm({ type: "archive", matter: m })} className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-gray-700 hover:bg-gray-100">{a.label}</button>
                            ) : a.key === "delete" ? (
                              <button onClick={() => setConfirm({ type: "delete", matter: m })} className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-red-700 hover:bg-red-50">{a.label}</button>
                            ) : (
                              <Link href={rowLink(m.id)} className="inline-flex h-9 items-center rounded-lg px-2 text-gray-500 hover:bg-gray-100" title={a.label}>
                                <MoreHorizontal size={18} aria-hidden="true" /><span className="sr-only">{a.label}</span>
                              </Link>
                            )}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile cards */}
            <ul className="divide-y divide-gray-100 md:hidden">
              {loading ? (
                <li className="p-4 text-center text-sm text-gray-500">Carregando…</li>
              ) : matters.length === 0 ? (
                <li><EmptyState title="Nenhuma matéria encontrada" /></li>
              ) : matters.map((m) => (
                <li key={m.id} className="p-4">
                  <Link href={rowLink(m.id)} className="block font-semibold text-blue-700">{m.title}</Link>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
                    <span>{actName(m.act_type_id) || "—"}</span>
                    <span>{unitName(m.org_unit_id) || "—"}</span>
                    <StatusBadge kind="matter" status={m.status} size="sm" />
                  </div>
                  <div className="mt-1 text-xs text-gray-500">{formatDateTime(m.updated_at)} · {pluralAnexos(m.attachment_count)}</div>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Paginação */}
        {!loading && !error && matters.length > 0 && (
          <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3">
            <span className="text-sm text-gray-600">Página {page + 1}</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="inline-flex h-9 items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 text-sm disabled:opacity-50">
                <ChevronLeft size={16} aria-hidden="true" />Anterior
              </button>
              <button onClick={() => setPage((p) => p + 1)} disabled={!hasMore} className="inline-flex h-9 items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 text-sm disabled:opacity-50">
                Próximo<ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.type === "delete" ? "Excluir matéria" : "Arquivar matéria"}
        message={confirm ? (confirm.type === "delete"
          ? `Tem certeza que deseja excluir definitivamente a matéria "${confirm.matter.title}"? Esta ação não pode ser desfeita.`
          : `Deseja arquivar a matéria "${confirm.matter.title}"? Ela sairá da lista ativa.`) : ""}
        confirmLabel={confirm?.type === "delete" ? "Excluir" : "Arquivar"}
        destructive={confirm?.type === "delete"}
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
