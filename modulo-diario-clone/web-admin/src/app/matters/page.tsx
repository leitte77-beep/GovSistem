"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MatterListItem, MatterStatus } from "@/types/matter";
import { api } from "@/lib/api";
import { getStatusLabel } from "@/components/Matter/StatusBadge";
import toast from "react-hot-toast";

const PAGE_SIZE = 15;

interface DashboardData {
  matters?: { total: number; draft: number; review: number; approved: number; published: number };
}

const STATUS_STYLES: Record<string, string> = {
  published: "bg-secondary-container text-on-secondary-container",
  draft: "bg-surface-container-highest text-on-surface-variant",
  review: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
  approved: "bg-secondary-container text-on-secondary-container",
  rejected: "bg-error-container text-error",
  archived: "bg-surface-container-highest text-on-surface-variant",
};

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-6 py-5"><div className="h-4 bg-outline-variant rounded w-48" /></td>
      <td className="px-6 py-5"><div className="h-5 bg-outline-variant rounded-full w-20" /></td>
      <td className="px-6 py-5 text-center"><div className="h-4 bg-outline-variant rounded w-8 mx-auto" /></td>
      <td className="px-6 py-5"><div className="h-4 bg-outline-variant rounded w-24" /></td>
      <td className="px-6 py-5"><div className="h-4 bg-outline-variant rounded w-8" /></td>
      <td className="px-6 py-5" />
    </tr>
  );
}

export default function MattersPage() {
  const router = useRouter();
  const [matters, setMatters] = useState<MatterListItem[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData>({});
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    api.getRaw<DashboardData>("/operations/dashboard")
      .then((d) => setDashboard(d))
      .catch(() => {});
  }, []);

  const fetch = useCallback(() => {
    setLoading(true);
    api
      .listMatters({
        search: search || undefined,
        status: statusFilter || undefined,
        skip: page * PAGE_SIZE,
        limit: PAGE_SIZE + 1,
      })
      .then((data) => {
        if (data.length > PAGE_SIZE) {
          setHasMore(true);
          setMatters(data.slice(0, PAGE_SIZE));
        } else {
          setHasMore(false);
          setMatters(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [search, statusFilter, page]);

  useEffect(() => {
    const timer = setTimeout(fetch, search ? 400 : 0);
    return () => clearTimeout(timer);
  }, [fetch]);

  useEffect(() => { setPage(0); }, [search, statusFilter]);

  const handleArchive = async (id: string) => {
    if (!confirm("Tem certeza que deseja arquivar esta matéria? Ela será movida para o arquivo e não aparecerá mais na lista.")) return;
    setDeleting(id);
    try {
      await api.archiveMatter(id);
      toast.success("Matéria arquivada com sucesso");
      setMatters((prev) => prev.filter((m) => m.id !== id));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao arquivar");
    } finally {
      setDeleting(null);
    }
  };

  const handleDelete = async (matter: MatterListItem) => {
    if (!confirm(`Tem certeza que deseja excluir a matéria "${matter.title}"? Esta ação não pode ser desfeita.`)) return;
    setDeleting(matter.id);
    try {
      await api.deleteMatter(matter.id);
      toast.success("Matéria excluída com sucesso");
      setMatters((prev) => prev.filter((m) => m.id !== matter.id));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir");
    } finally {
      setDeleting(null);
    }
  };

  const dashboardMatters = dashboard.matters;

  return (
    <div className="p-8 overflow-y-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-headline-lg font-headline-lg text-primary tracking-tight">
            Matérias
          </h2>
          <p className="text-body-md text-on-surface-variant">
            Gerenciamento e publicação de atos oficiais
          </p>
        </div>
        <Link
          href="/matters/new"
          className="bg-primary hover:bg-primary-container text-white px-6 py-3 rounded-xl flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-primary/10"
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
          <span className="text-label-md font-label-md">Nova Matéria</span>
        </Link>
      </div>

      {/* Filter Bar */}
      <div className="bg-surface-container-lowest/80 backdrop-blur-sm p-4 rounded-xl mb-6 flex flex-col md:flex-row gap-4 items-center border border-outline-variant/80 shadow-sm">
        <div className="relative flex-1 w-full">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline">
            search
          </span>
          <input
            className="w-full h-14 pl-12 pr-4 bg-surface border border-outline-variant rounded-lg text-body-md focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
            placeholder="Buscar por título, conteúdo..."
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-full md:w-64">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full h-14 bg-surface border border-outline-variant rounded-lg text-body-md text-on-surface-variant focus:border-primary focus:ring-1 focus:ring-primary/20 px-4"
          >
            <option value="">Todos os status</option>
            {(["draft", "review", "approved", "published", "rejected", "archived"] as MatterStatus[]).map((s) => (
              <option key={s} value={s}>{getStatusLabel(s)}</option>
            ))}
          </select>
        </div>
        <button className="h-14 px-6 border border-outline-variant rounded-lg text-on-surface-variant hover:bg-surface-container-low transition-colors flex items-center gap-2 flex-shrink-0">
          <span className="material-symbols-outlined">filter_list</span>
          <span className="text-label-md font-label-md">Mais Filtros</span>
        </button>
      </div>

      {/* Table */}
      <div className="bg-surface-container-lowest rounded-2xl overflow-hidden shadow-sm border border-outline-variant">
        <table className="w-full text-left border-collapse">
          <thead className="bg-surface-container-low">
            <tr>
              <th className="px-6 py-4 text-label-md font-label-md text-on-surface-variant">Título</th>
              <th className="px-6 py-4 text-label-md font-label-md text-on-surface-variant">Status</th>
              <th className="px-6 py-4 text-label-md font-label-md text-on-surface-variant text-center">Versão</th>
              <th className="px-6 py-4 text-label-md font-label-md text-on-surface-variant">Atualizado</th>
              <th className="px-6 py-4 text-label-md font-label-md text-on-surface-variant">Anexos</th>
              <th className="px-6 py-4 text-label-md font-label-md text-on-surface-variant text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/30">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
            ) : matters.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-on-surface-variant">
                  <span className="material-symbols-outlined text-4xl mb-2 block text-outline">search_off</span>
                  Nenhuma matéria encontrada
                </td>
              </tr>
            ) : (
              matters.map((m) => {
                const statusStyle = STATUS_STYLES[m.status] || "bg-surface-container-highest text-on-surface-variant";
                return (
                  <tr key={m.id} className="hover:bg-surface-container-low/50 transition-colors group">
                    <td className="px-6 py-5">
                      <Link href={`/matters/${m.id}/edit`} className="block">
                        <span className="text-body-md font-semibold text-primary group-hover:underline cursor-pointer">
                          {m.title}
                        </span>
                      </Link>
                    </td>
                    <td className="px-6 py-5">
                      <span className={`px-3 py-1 text-[11px] font-bold rounded-full uppercase tracking-wider ${statusStyle}`}>
                        {getStatusLabel(m.status)}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-center text-body-sm font-medium">
                      {m.version}
                    </td>
                    <td className="px-6 py-5 text-body-sm text-on-surface-variant">
                      {new Date(m.updated_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex gap-1">
                        {m.attachment_count > 0 ? (
                          <span className="material-symbols-outlined text-[18px] text-primary" title={`${m.attachment_count} anexo(s)`}>
                            attachment
                          </span>
                        ) : (
                          <span className="text-on-surface-variant opacity-40">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/matters/${m.id}/edit`}
                          className="text-primary hover:bg-primary/10 px-4 py-2 rounded-lg text-label-md font-label-md transition-all inline-block"
                        >
                          Editar
                        </Link>
                        {(m.status === "draft" || m.status === "archived") && (
                          <button
                            onClick={() => handleDelete(m)}
                            disabled={deleting === m.id}
                            className="text-error hover:bg-error-container/20 px-3 py-2 rounded-lg text-label-md font-label-md transition-all inline-flex items-center gap-1 disabled:opacity-50"
                            title="Excluir matéria"
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              {deleting === m.id ? "progress_activity" : "delete"}
                            </span>
                          </button>
                        )}
                        {(m.status === "draft" || m.status === "rejected" || m.status === "review") && (
                          <button
                            onClick={() => handleArchive(m.id)}
                            disabled={deleting === m.id}
                            className="text-error hover:bg-error-container/20 px-3 py-2 rounded-lg text-label-md font-label-md transition-all inline-flex items-center gap-1 disabled:opacity-50"
                            title="Arquivar matéria"
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              {deleting === m.id ? "progress_activity" : "archive"}
                            </span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {!loading && matters.length > 0 && (
          <div className="px-6 py-4 bg-surface flex items-center justify-between border-t border-outline-variant/30">
            <span className="text-body-sm text-on-surface-variant">
              Página {page + 1}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="flex items-center gap-1 px-4 py-2 border border-outline-variant rounded-lg text-body-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-container-high transition-all"
              >
                <span className="material-symbols-outlined text-[20px]">chevron_left</span>
                Anterior
              </button>
              <div className="flex items-center gap-1">
                <span className="w-10 h-10 bg-primary text-white rounded-lg font-bold text-body-sm flex items-center justify-center">
                  {page + 1}
                </span>
                {hasMore && (
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    className="w-10 h-10 hover:bg-surface-container-high rounded-lg font-medium text-body-sm transition-colors flex items-center justify-center"
                  >
                    {page + 2}
                  </button>
                )}
              </div>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasMore}
                className="flex items-center gap-1 px-4 py-2 border border-outline-variant rounded-lg text-body-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-container-high transition-all"
              >
                Próximo
                <span className="material-symbols-outlined text-[20px]">chevron_right</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Insights Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
        <div className="bg-surface-container-lowest p-6 rounded-2xl border-l-4 border-secondary shadow-sm hover:shadow-md transition-shadow border border-outline-variant/50">
          <div className="flex justify-between items-start mb-4">
            <span className="material-symbols-outlined text-secondary bg-secondary-container/30 p-2 rounded-lg">
              verified
            </span>
            <span className="text-[10px] font-bold text-secondary uppercase">Esta Semana</span>
          </div>
          <h3 className="text-headline-md font-headline-md text-primary">
            {dashboardMatters?.published ?? "-"}
          </h3>
          <p className="text-body-sm text-on-surface-variant">Matérias Publicadas</p>
        </div>
        <div className="bg-surface-container-lowest p-6 rounded-2xl border-l-4 border-tertiary shadow-sm hover:shadow-md transition-shadow border border-outline-variant/50">
          <div className="flex justify-between items-start mb-4">
            <span className="material-symbols-outlined text-tertiary-container bg-tertiary-fixed/30 p-2 rounded-lg">
              pending_actions
            </span>
            <span className="text-[10px] font-bold text-tertiary uppercase">Aguardando</span>
          </div>
          <h3 className="text-headline-md font-headline-md text-primary">
            {dashboardMatters?.review ?? "-"}
          </h3>
          <p className="text-body-sm text-on-surface-variant">Em Revisão Técnica</p>
        </div>
        <div className="bg-surface-container-lowest p-6 rounded-2xl border-l-4 border-primary shadow-sm hover:shadow-md transition-shadow border border-outline-variant/50">
          <div className="flex justify-between items-start mb-4">
            <span className="material-symbols-outlined text-primary bg-primary-fixed/30 p-2 rounded-lg">
              drafts
            </span>
            <span className="text-[10px] font-bold text-primary-container uppercase">Pessoais</span>
          </div>
          <h3 className="text-headline-md font-headline-md text-primary">
            {dashboardMatters?.draft ?? "-"}
          </h3>
          <p className="text-body-sm text-on-surface-variant">Meus Rascunhos</p>
        </div>
      </div>
    </div>
  );
}
