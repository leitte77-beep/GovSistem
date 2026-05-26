"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import Modal from "@/components/ui/Modal";
import api from "@/lib/api";
import toast from "react-hot-toast";

interface Organization {
  id: string;
  name: string;
  slug: string;
  cnpj: string;
  is_active: boolean;
  created_at: string;
  user_count: number;
}

const iconColors = [
  { bg: "bg-blue-50", text: "text-primary" },
  { bg: "bg-orange-50", text: "text-orange-600" },
  { bg: "bg-indigo-50", text: "text-indigo-600" },
  { bg: "bg-emerald-50", text: "text-emerald-600" },
  { bg: "bg-rose-50", text: "text-rose-600" },
  { bg: "bg-violet-50", text: "text-violet-600" },
];

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).replace(/\./g, "");
}

function generateBars(count: number) {
  if (count === 0) return null;
  const heights = [];
  for (let i = 0; i < 6; i++) {
    const h = count > 0 ? Math.max(20, Math.min(95, 30 + (count * 1.2) + (Math.sin(i * 2.5) * 20))) : 20;
    heights.push(Math.round(h));
  }
  return (
    <div className="w-24 h-8 bg-slate-50 rounded flex items-end gap-1 p-1 overflow-hidden">
      {heights.map((h, i) => (
        <div key={i} className="flex-1 bg-primary/20 rounded-sm" style={{ height: `${h}%` }} />
      ))}
    </div>
  );
}

export default function OrganizacoesPage() {
  const router = useRouter();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<Organization | null>(null);
  const [deleting, setDeleting] = useState(false);

  const perPage = 10;

  const fetchOrgs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ data: Organization[]; total: number }>(
        `/organizations?page=${page}&per_page=${perPage}&search=${encodeURIComponent(search)}`
      );
      setOrgs(res.data || []);
      setTotal(res.total || 0);
    } catch {
      toast.error("Erro ao carregar organizações");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`/organizations/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Organização excluída com sucesso!");
      setDeleteTarget(null);
      fetchOrgs();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir");
    } finally {
      setDeleting(false);
    }
  };

  const totalPages = Math.ceil(total / perPage);

  return (
    <AppLayout title="GovSistem">
      <div className="max-w-[1400px] mx-auto">
        <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="flex-1">
            <nav className="flex mb-4">
              <ol className="flex items-center space-x-2 text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400">
                <li className="text-primary/60">Administração</li>
              </ol>
            </nav>
            <div className="relative inline-block">
              <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight leading-none mb-3">Organizações</h2>
              <div className="h-1.5 w-1/3 rounded-full" style={{ backgroundColor: "#002b54" }} />
            </div>
            <p className="text-slate-500 text-lg max-w-2xl font-medium mt-4">
              Ecossistema de prefeituras e órgãos integrados. Gerencie instâncias, permissões e monitore a atividade global da plataforma.
            </p>
          </div>
          <button
            onClick={() => router.push("/orgaos/new")}
            className="inline-flex items-center gap-3 px-8 py-4 font-bold text-sm rounded-2xl hover:-translate-y-0.5 transition-all shadow-xl active:scale-95 group"
            style={{ backgroundColor: "#002b54", color: "white", boxShadow: "0 10px 15px -3px rgba(0,43,84,0.2)" }}
          >
            <div className="bg-white/20 p-1.5 rounded-lg group-hover:bg-white/30 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 6v6m0 0v6m0-6h6m-6 0H6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" /></svg>
            </div>
            Nova Organização
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {loading ? (
            <div className="space-y-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-3xl border border-slate-200/60 p-6 animate-pulse">
                  <div className="flex items-center gap-6">
                    <div className="w-20 h-20 rounded-2xl bg-slate-200" />
                    <div className="flex-1 space-y-3">
                      <div className="h-5 bg-slate-200 rounded w-64" />
                      <div className="h-3 bg-slate-200 rounded w-48" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : orgs.length === 0 ? (
            <div className="bg-white/60 backdrop-blur rounded-3xl border border-slate-200/60 p-12 text-center">
              <p className="text-slate-500 font-medium">Nenhuma organização encontrada.</p>
            </div>
          ) : (
            orgs.map((org, idx) => {
              const color = iconColors[idx % iconColors.length];
              return (
                <div
                  key={org.id}
                  className="bg-white rounded-3xl border border-slate-200/60 p-6 flex flex-col lg:flex-row items-start lg:items-center gap-8 transition-all hover:shadow-2xl group relative overflow-hidden"
                  style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}
                >
                  <div className="absolute top-0 right-0 p-1">
                    <div
                      className="text-[9px] font-black uppercase px-3 py-1 rounded-bl-xl tracking-widest opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ backgroundColor: org.is_active ? "rgba(0,43,84,0.05)" : "rgba(100,116,139,0.1)", color: org.is_active ? "#002b54" : "#64748b" }}
                    >
                      {org.is_active ? "Premium Tenant" : "Inativo"}
                    </div>
                  </div>

                  <div className="flex items-center gap-6 flex-1 min-w-0">
                    <div
                      className={`w-20 h-20 rounded-2xl flex flex-shrink-0 items-center justify-center transition-all duration-500 shadow-inner ${color.bg} ${color.text} group-hover:bg-[#002b54] group-hover:text-white`}
                    >
                      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" /></svg>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-xl font-bold text-slate-900 truncate">{org.name}</h3>
                        {org.is_active ? (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 uppercase tracking-wider">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" /> Ativa
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 uppercase tracking-wider">
                            Inativa
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 flex-wrap">
                        <code className="text-xs font-mono text-slate-400 flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /><path d="M10.172 13.828a4 4 0 015.656 0l4 4a4 4 0 11-5.656 5.656l-1.102-1.101" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
                          {org.slug}
                        </code>
                        <span className="text-[11px] text-slate-400 font-medium">
                          Cadastrada em {formatDate(org.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-12 px-8 py-2 border-l border-r border-slate-100/80 hidden xl:flex">
                    <div className="text-center">
                      <div className={`text-2xl font-black ${org.user_count > 0 ? "text-slate-900" : "text-slate-300 italic"}`}>
                        {org.user_count}
                      </div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Usuários</div>
                    </div>
                    {org.user_count > 0 ? generateBars(org.user_count) : (
                      <div className="w-24 h-8 bg-slate-50 rounded flex items-center justify-center p-1 overflow-hidden">
                        <span className="text-[9px] font-bold text-slate-300 uppercase tracking-tighter">Sem dados</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3 lg:ml-auto">
                    <button
                      onClick={() => router.push(`/orgaos/${org.id}/edit`)}
                      className="p-3 text-slate-400 hover:text-primary hover:bg-slate-50 rounded-xl transition-all"
                      title="Editar Configurações"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
                    </button>
                    <button
                      onClick={() => setDeleteTarget(org)}
                      className="p-3 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                      title="Excluir"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-4v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {totalPages > 1 && (
          <div className="mt-12 flex items-center justify-between p-6 bg-white/60 backdrop-blur rounded-3xl border border-slate-200/60 shadow-sm">
            <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">
              Exibindo {orgs.length} de {total} entidades
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
                className="p-3 text-slate-400 hover:text-primary transition-all disabled:opacity-20"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" /></svg>
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const start = Math.max(1, page - 2);
                const n = start + i;
                if (n > totalPages) return null;
                return (
                  <button
                    key={n}
                    onClick={() => setPage(n)}
                    className={`w-10 h-10 rounded-xl text-xs font-bold transition-all ${
                      n === page
                        ? "text-white shadow-lg"
                        : "hover:bg-white text-slate-600 border border-transparent hover:border-slate-200"
                    }`}
                    style={n === page ? { backgroundColor: "#002b54", boxShadow: "0 4px 6px -1px rgba(0,43,84,0.2)" } : {}}
                  >
                    {n}
                  </button>
                );
              })}
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="p-3 text-slate-400 hover:text-primary transition-all disabled:opacity-20"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" /></svg>
              </button>
            </div>
          </div>
        )}
      </div>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirmar Exclusão" size="sm">
        <p className="text-gray-600 mb-4">
          Tem certeza que deseja excluir a organização <strong>{deleteTarget?.name}</strong>?
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setDeleteTarget(null)}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {deleting ? "Excluindo..." : "Excluir"}
          </button>
        </div>
      </Modal>
    </AppLayout>
  );
}
