"use client";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import Modal from "@/components/ui/Modal";
import Spinner from "@/components/ui/Spinner";
import { Plus, Search, Pencil, Trash2, Users, UserCheck, ShieldCheck, Filter, Download, Upload, ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react";
import api from "@/lib/api";
import toast from "react-hot-toast";

interface User {
  id: string;
  name: string;
  email: string;
  cpf?: string;
  is_platform_admin: boolean;
  platform_role: string;
  is_active: boolean;
}

function getInitials(name: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_COLORS = [
  "bg-primary-100 text-primary-700",
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
  "bg-cyan-100 text-cyan-700",
];

export default function UsuariosPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [stats, setStats] = useState({ active: 0, admins: 0 });
  const perPage = 10;
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    window.open(`/api/v1/users/export/csv`, "_blank");
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const result = await api<{ created: number; skipped: number; errors: string[] }>("/users/import/csv", {
        method: "POST",
        body: formData,
        headers: {},
      });
      let msg = `${result.created} usuarios criados.`;
      if (result.skipped > 0) msg += ` ${result.skipped} ignorados.`;
      toast.success(msg);
      if (result.errors.length > 0) {
        console.warn("Import errors:", result.errors);
        if (result.errors.length <= 3) {
          result.errors.forEach((err: string) => toast.error(err));
        } else {
          toast.error(`${result.errors.length} erros. Consulte o console.`);
        }
      }
      fetchUsers();
      fetchStats();
    } catch (err: any) {
      toast.error(err.message || "Erro ao importar");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ data: User[]; total: number }>(
        `/users?page=${page}&limit=${perPage}&search=${encodeURIComponent(search)}`
      );
      setUsers(res.data);
      setTotal(res.total);
    } catch {
      toast.error("Erro ao carregar usuarios");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  const fetchStats = useCallback(async () => {
    try {
      const [activeRes, adminsRes] = await Promise.all([
        api<{ total: number }>('/users?limit=1&is_active=true&search='),
        api<{ total: number }>('/users?limit=1&search='),
      ]);
      // Approximate: count platform admins from first page
      const allRes = await api<{ data: User[]; total: number }>('/users?limit=200');
      const adminCount = allRes.data.filter(u => u.is_platform_admin).length;
      setStats({ active: activeRes.total, admins: adminCount });
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { fetchStats(); }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`/users/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Usuario excluido com sucesso!");
      setDeleteTarget(null);
      fetchUsers();
      fetchStats();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir");
    } finally {
      setDeleting(false);
    }
  };

  const totalPages = Math.ceil(total / perPage);
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  // Build page numbers for pagination
  const pageNumbers: (number | string)[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) {
      pageNumbers.push(i);
    } else if (pageNumbers[pageNumbers.length - 1] !== "...") {
      pageNumbers.push("...");
    }
  }

  return (
    <AppLayout title="Usuarios">
      {/* Page Header */}
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-2xl font-extrabold text-on-surface tracking-tight">Usuarios</h1>
          <p className="text-body-sm text-on-surface-variant mt-1">
            Gerencie permissoes e perfis de acesso da plataforma.
          </p>
        </div>
        <button
          onClick={() => router.push("/usuarios/new")}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-on-primary rounded-lg text-sm font-semibold hover:bg-primary-700 active:scale-[0.98] transition-all shadow-md shadow-primary-600/20"
        >
          <Plus size={16} />
          Novo Usuario
        </button>
      </div>

      {/* Table Card */}
      <Card>
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 pb-4 border-b border-outline-variant">
          <div className="relative w-full sm:w-72">
            <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              type="text"
              placeholder="Buscar usuarios..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-4 py-2 border border-outline-variant rounded-lg focus:border-primary-500 focus:ring-1.5 focus:ring-primary-500 outline-none text-sm bg-surface text-on-surface placeholder:text-on-surface-variant/60"
            />
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 px-4 py-2 border border-outline-variant rounded-lg text-sm font-medium text-on-surface-variant hover:bg-surface-container-low transition-colors">
              <Upload size={16} />
              Importar
            </button>
            <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 border border-outline-variant rounded-lg text-sm font-medium text-on-surface-variant hover:bg-surface-container-low transition-colors">
              <Download size={16} />
              Exportar
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low">
                <th className="px-5 py-3.5 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                  <div className="flex items-center gap-1 cursor-pointer hover:text-on-surface">
                    Nome <ChevronsUpDown size={13} className="text-on-surface-variant/50" />
                  </div>
                </th>
                <th className="px-5 py-3.5 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                  <div className="flex items-center gap-1 cursor-pointer hover:text-on-surface">
                    Email <ChevronsUpDown size={13} className="text-on-surface-variant/50" />
                  </div>
                </th>
                <th className="px-5 py-3.5 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                  Admin Plataforma
                </th>
                <th className="px-5 py-3.5 text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                  Status
                </th>
                <th className="px-5 py-3.5 text-xs font-semibold text-on-surface-variant uppercase tracking-wider text-right">
                  Acoes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-20 text-center">
                    <div className="flex justify-center">
                      <Spinner />
                    </div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-20 text-center text-on-surface-variant text-sm">
                    {search ? "Nenhum usuario encontrado." : "Nenhum usuario cadastrado."}
                  </td>
                </tr>
              ) : (
                users.map((user, idx) => (
                  <tr
                    key={user.id}
                    className="hover:bg-surface-container-low transition-colors group"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full font-bold flex items-center justify-center text-xs shrink-0 ${AVATAR_COLORS[idx % AVATAR_COLORS.length]}`}>
                          {getInitials(user.name)}
                        </div>
                        <span className="text-sm font-semibold text-on-surface">
                          {user.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-on-surface-variant">
                      {user.email}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex px-2.5 py-0.5 rounded text-[11px] font-bold uppercase ${
                        user.is_platform_admin
                          ? "bg-primary-100 text-primary-700"
                          : "bg-surface-container-high text-on-surface-variant"
                      }`}>
                        {user.is_platform_admin ? "Sim" : "Nao"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                        user.is_active
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-red-100 text-red-700"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${user.is_active ? "bg-emerald-600" : "bg-red-600"}`} />
                        {user.is_active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); router.push(`/usuarios/${user.id}/edit`); }}
                          className="p-1.5 text-on-surface-variant hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all"
                          title="Editar"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(user); }}
                          className="p-1.5 text-on-surface-variant hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          title="Excluir"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between pt-4 border-t border-outline-variant">
          <p className="text-xs text-on-surface-variant">
            Mostrando {from}-{to} de {total} usuarios
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
                className="p-1.5 text-on-surface-variant hover:bg-surface-container-low rounded-lg transition-colors disabled:opacity-30"
              >
                <ChevronLeft size={18} />
              </button>
              {pageNumbers.map((p, i) =>
                p === "..." ? (
                  <span key={`dots-${i}`} className="px-2 text-on-surface-variant text-xs">...</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p as number)}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-semibold transition-colors ${
                      page === p
                        ? "bg-primary-600 text-on-primary"
                        : "text-on-surface-variant hover:bg-surface-container-low"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className="p-1.5 text-on-surface-variant hover:bg-surface-container-low rounded-lg transition-colors disabled:opacity-30"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </div>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <div className="p-5 bg-surface-container-lowest border border-outline-variant rounded-xl flex items-center gap-4">
          <div className="w-11 h-11 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 shrink-0">
            <Users size={22} />
          </div>
          <div>
            <p className="text-xs text-on-surface-variant font-medium">Total de Usuarios</p>
            <h4 className="text-xl font-bold text-on-surface">{total}</h4>
          </div>
        </div>
        <div className="p-5 bg-surface-container-lowest border border-outline-variant rounded-xl flex items-center gap-4">
          <div className="w-11 h-11 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            <UserCheck size={22} />
          </div>
          <div>
            <p className="text-xs text-on-surface-variant font-medium">Ativos</p>
            <h4 className="text-xl font-bold text-on-surface">{stats.active}</h4>
          </div>
        </div>
        <div className="p-5 bg-surface-container-lowest border border-outline-variant rounded-xl flex items-center gap-4">
          <div className="w-11 h-11 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
            <ShieldCheck size={22} />
          </div>
          <div>
            <p className="text-xs text-on-surface-variant font-medium">Administradores</p>
            <h4 className="text-xl font-bold text-on-surface">{stats.admins}</h4>
          </div>
        </div>
      </div>

      {/* Delete Modal */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirmar Exclusao" size="sm">
        <p className="text-on-surface-variant mb-5">
          Tem certeza que deseja excluir o usuario <strong className="text-on-surface">{deleteTarget?.name}</strong>?
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setDeleteTarget(null)}
            className="px-4 py-2 text-sm border border-outline-variant rounded-lg hover:bg-surface-container-low text-on-surface-variant"
          >
            Cancelar
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium"
          >
            {deleting ? "Excluindo..." : "Excluir"}
          </button>
        </div>
      </Modal>

      <input ref={fileRef} type="file" accept=".csv" onChange={handleImport} className="hidden" />
    </AppLayout>
  );
}
