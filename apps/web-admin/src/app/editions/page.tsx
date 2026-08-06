"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { EditionListItem } from "@/types/edition";
import { api } from "@/lib/api";
import toast from "react-hot-toast";

const TYPE_LABELS: Record<string, string> = { normal: "Normal", extra: "Extraordinária", suplementar: "Suplementar" };
const PAGE_SIZE = 15;

interface DashboardData {
  editions?: { total: number; published: number; draft: number; signed: number; pdf_generated: number };
  matters?: { total: number; draft: number; review: number; approved: number; published: number };
}

const STATUS_CONFIG: Record<string, { icon: string; bg: string; text: string; border: string }> = {
  published: { icon: "verified", bg: "bg-on-tertiary-container/10", text: "text-on-tertiary-container", border: "border-on-tertiary-container/20" },
  draft: { icon: "drafts", bg: "bg-secondary-container/40", text: "text-on-secondary-container", border: "border-secondary/20" },
  closed: { icon: "lock", bg: "bg-surface-container-high", text: "text-on-surface-variant", border: "border-outline-variant" },
  pdf_generated: { icon: "picture_as_pdf", bg: "bg-tertiary-fixed/30", text: "text-on-tertiary-fixed-variant", border: "border-tertiary-fixed-dim" },
  signed: { icon: "verified_user", bg: "bg-primary-fixed/30", text: "text-on-primary-fixed-variant", border: "border-primary-fixed-dim" },
  cancelled: { icon: "cancel", bg: "bg-error-container/30", text: "text-on-error-container", border: "border-error/20" },
  reviewing: { icon: "rate_review", bg: "bg-tertiary-fixed/30", text: "text-on-tertiary-fixed-variant", border: "border-tertiary-fixed-dim" },
  scheduled: { icon: "schedule", bg: "bg-surface-container-high", text: "text-on-surface-variant", border: "border-outline-variant" },
};

const STATUS_LABELS: Record<string, string> = {
  published: "Publicado", draft: "Rascunho", closed: "Fechada",
  pdf_generated: "PDF Gerado", signed: "Assinada", cancelled: "Cancelado",
  reviewing: "Em Revisão", scheduled: "Agendada",
};

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-6 py-5"><div className="h-4 bg-outline-variant rounded w-16" /></td>
      <td className="px-6 py-5"><div className="h-4 bg-outline-variant rounded w-56" /></td>
      <td className="px-6 py-5"><div className="h-4 bg-outline-variant rounded w-20" /></td>
      <td className="px-6 py-5"><div className="h-5 bg-outline-variant rounded-full w-24" /></td>
      <td className="px-6 py-5"><div className="h-4 bg-outline-variant rounded w-12" /></td>
      <td className="px-6 py-5"><div className="h-4 bg-outline-variant rounded w-24" /></td>
      <td className="px-6 py-5" />
    </tr>
  );
}

export default function EditionsPage() {
  const [editions, setEditions] = useState<EditionListItem[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData>({});
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);
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
    api.listEditions({ status: statusFilter || undefined, skip: page * PAGE_SIZE, limit: PAGE_SIZE })
      .then((data) => {
        let filtered = data;
        if (search) {
          const q = search.toLowerCase();
          filtered = data.filter(
            (e) =>
              e.title.toLowerCase().includes(q) ||
              TYPE_LABELS[e.type]?.toLowerCase().includes(q) ||
              String(e.year).includes(q) ||
              String(e.number).includes(q)
          );
        }
        setHasMore(data.length === PAGE_SIZE);
        setEditions(filtered);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [search, statusFilter, page]);

  useEffect(() => { fetch(); }, [fetch]);
  useEffect(() => { setPage(0); }, [search, statusFilter]);

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Tem certeza que deseja excluir permanentemente a edição "${title}"? O número ficará disponível para reuso.`)) return;
    setCancelling(id);
    try {
      await api.deleteEdition(id);
      toast.success("Edição excluída");
      setEditions((prev) => prev.filter((e) => e.id !== id));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir");
    } finally {
      setCancelling(null);
    }
  };

  const dash = dashboard.editions;
  const total = dash?.total ?? "-";
  const published = dash?.published ?? "-";
  const drafts = dash?.draft ?? "-";

  return (
    <div className="p-gutter max-w-container-max mx-auto w-full flex flex-col gap-stack-md">
      {/* Page Header */}
      <div className="flex justify-between items-end">
        <div className="space-y-1">
          <h2 className="text-headline-lg font-headline-lg text-primary">Edições</h2>
          <p className="text-body-md text-on-surface-variant">Gerenciamento e publicação das edições do Diário Oficial.</p>
        </div>
        <Link
          href="/editions/new"
          className="flex items-center gap-2 bg-on-tertiary-container text-white px-6 py-3 rounded-xl shadow-md hover:shadow-lg hover:brightness-110 active:scale-95 transition-all font-bold"
        >
          <span className="material-symbols-outlined">add_circle</span>
          Nova Edição
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
        <div className="bg-surface-container-lowest border border-outline-variant p-6 rounded-xl shadow-sm flex items-center justify-between">
          <div>
            <p className="text-on-surface-variant text-sm font-medium">Edições Publicadas</p>
            <h3 className="text-3xl font-bold text-primary">{published}</h3>
          </div>
          <div className="w-12 h-12 bg-primary-fixed flex items-center justify-center rounded-full text-on-primary-fixed-variant">
            <span className="material-symbols-outlined">check_circle</span>
          </div>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant p-6 rounded-xl shadow-sm flex items-center justify-between">
          <div>
            <p className="text-on-surface-variant text-sm font-medium">Em Rascunho</p>
            <h3 className="text-3xl font-bold text-primary">{drafts}</h3>
          </div>
          <div className="w-12 h-12 bg-tertiary-fixed flex items-center justify-center rounded-full text-on-tertiary-fixed-variant">
            <span className="material-symbols-outlined">edit_note</span>
          </div>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant p-6 rounded-xl shadow-sm flex items-center justify-between">
          <div>
            <p className="text-on-surface-variant text-sm font-medium">Total de Edições</p>
            <h3 className="text-3xl font-bold text-primary">{total}</h3>
          </div>
          <div className="w-12 h-12 bg-primary-fixed flex items-center justify-center rounded-full text-on-primary-fixed-variant">
            <span className="material-symbols-outlined">auto_stories</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface-container-lowest border border-outline-variant p-gutter rounded-xl shadow-sm">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full group">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors">
              search
            </span>
            <input
              className="w-full h-14 pl-12 pr-4 bg-surface-container-low border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary rounded-xl text-body-md transition-all outline-none"
              placeholder="Buscar por título, tipo, ano..."
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-full md:w-64">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full h-14 px-4 bg-surface-container-low border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary rounded-xl text-body-md outline-none"
            >
              <option value="">Todos os status</option>
              <option value="draft">Rascunho</option>
              <option value="closed">Fechada</option>
              <option value="pdf_generated">PDF Gerado</option>
              <option value="signed">Assinada</option>
              <option value="published">Publicada</option>
              <option value="cancelled">Cancelada</option>
            </select>
          </div>
          <button className="h-14 px-6 border border-primary text-primary hover:bg-primary/5 font-bold rounded-xl transition-all flex items-center gap-2">
            <span className="material-symbols-outlined">filter_list</span>
            Filtros
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-outline-variant">
                <th className="px-6 py-4 font-bold text-sm text-primary uppercase tracking-wider">Edição</th>
                <th className="px-6 py-4 font-bold text-sm text-primary uppercase tracking-wider">Título</th>
                <th className="px-6 py-4 font-bold text-sm text-primary uppercase tracking-wider">Tipo</th>
                <th className="px-6 py-4 font-bold text-sm text-primary uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 font-bold text-sm text-primary uppercase tracking-wider text-center">Matérias</th>
                <th className="px-6 py-4 font-bold text-sm text-primary uppercase tracking-wider">Data</th>
                <th className="px-6 py-4 font-bold text-sm text-primary uppercase tracking-wider text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              ) : editions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-on-surface-variant">
                    <span className="material-symbols-outlined text-4xl mb-2 block text-outline">auto_stories</span>
                    Nenhuma edição encontrada
                  </td>
                </tr>
              ) : (
                editions.map((e) => {
                  const st = STATUS_CONFIG[e.status] || STATUS_CONFIG.draft;
                  return (
                    <tr key={e.id} className="hover:bg-surface-container-low transition-colors group">
                      <td className="px-6 py-5 font-bold text-primary">{e.year}/{e.number}</td>
                      <td className="px-6 py-5">
                        <Link href={`/editions/${e.id}/edit`} className="block">
                          <span className="font-bold text-on-surface group-hover:text-primary transition-colors">{e.title}</span>
                        </Link>
                      </td>
                      <td className="px-6 py-5 text-on-surface-variant font-medium">{TYPE_LABELS[e.type] || e.type}</td>
                      <td className="px-6 py-5">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${st.bg} ${st.text} ${st.border}`}>
                          <span className="material-symbols-outlined text-xs">{st.icon}</span>
                          {STATUS_LABELS[e.status] || e.status}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-center">
                        <span className="bg-surface-container-high px-2 py-1 rounded text-xs font-bold text-primary">
                          {e.item_count} {e.item_count === 1 ? "Matéria" : "Matérias"}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-on-surface-variant">
                        {new Date(e.publication_date).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/editions/${e.id}/edit`}
                            className="p-2 hover:bg-primary/10 rounded-lg text-primary transition-all flex items-center gap-1 font-bold text-sm"
                          >
                            <span className="material-symbols-outlined text-sm">edit</span>
                            Editar
                          </Link>
                          {e.status !== "published" && (
                            <button
                              onClick={() => handleDelete(e.id, e.title)}
                              disabled={cancelling === e.id}
                              className="p-2 hover:bg-error-container/20 rounded-lg text-error transition-all disabled:opacity-50"
                              title="Excluir edição"
                            >
                              <span className="material-symbols-outlined text-sm">
                                {cancelling === e.id ? "progress_activity" : "delete"}
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
        </div>

        {/* Pagination */}
        {!loading && editions.length > 0 && (
          <div className="px-6 py-4 border-t border-outline-variant flex items-center justify-between bg-surface-container-lowest">
            <p className="text-sm text-on-surface-variant">
              Exibindo <span className="font-bold text-on-surface">1 - {editions.length}</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="flex items-center px-4 py-2 border border-outline-variant text-on-surface-variant rounded-lg hover:bg-surface-container-low transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-lg mr-1">chevron_left</span>
                Anterior
              </button>
              <div className="flex gap-1">
                <span className="w-10 h-10 flex items-center justify-center bg-primary text-white rounded-lg font-bold text-sm">
                  {page + 1}
                </span>
                {hasMore && (
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    className="w-10 h-10 flex items-center justify-center hover:bg-surface-container-high rounded-lg transition-all text-sm"
                  >
                    {page + 2}
                  </button>
                )}
              </div>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasMore}
                className="flex items-center px-4 py-2 border border-outline-variant text-on-surface-variant rounded-lg hover:bg-surface-container-low transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Próximo
                <span className="material-symbols-outlined text-lg ml-1">chevron_right</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Banner */}
      <div className="rounded-2xl overflow-hidden h-[300px] relative group mt-2">
        <Image
          alt="Transparência Governamental"
          className="w-full h-full object-cover brightness-75 group-hover:scale-105 transition-transform duration-700"
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuC2vaSQ-UfJeZzh3J2eykbEZ-3uaICv96aGquVT3FBIHmGEmxhVNNSDdKG24A_7xeAcDJcuysg7i3x2ffEHCc5lSW7IInVDY1HBRvy9dCsc-2-YvtLmyEV3A70wifmQ7gjnT-3GXxzEEUJI6tz0fgoPf_xWl_dP1-SR2h0hjlYGeyTrmHmk00Vx0yLJhFfpqmMBjJ5eqn7tF372S9CoGTFt8aDO2FD3_Y1pJW5x82d0WtGMWgeCVJvWmo1OoftMcAp-TsP8zNAQWr7U"
          fill
          unoptimized
        />
        <div className="absolute inset-0 bg-gradient-to-t from-primary/80 to-transparent flex flex-col justify-end p-gutter">
          <h4 className="text-white text-headline-md font-headline-md">Transparência Governamental</h4>
          <p className="text-white/80 max-w-xl">Nosso sistema garante que cada publicação oficial seja auditável e acessível a todo o cidadão brasileiro.</p>
        </div>
      </div>
    </div>
  );
}
