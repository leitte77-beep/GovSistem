"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppLayout from "@/components/layout/AppLayout";
import Card from "@/components/ui/Card";
import Table, { Column } from "@/components/ui/Table";
import Badge from "@/components/ui/Badge";
import Modal from "@/components/ui/Modal";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
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

export default function UsuariosPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);
  const perPage = 10;

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

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`/users/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Usuario excluido com sucesso!");
      setDeleteTarget(null);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir");
    } finally {
      setDeleting(false);
    }
  };

  const totalPages = Math.ceil(total / perPage);

  const columns: Column<User>[] = [
    { key: "name", label: "Nome", sortable: true },
    { key: "email", label: "Email", sortable: true },
    {
      key: "cpf",
      label: "CPF",
      render: (val: string) => val ? `${val.slice(0, 3)}.***.${val.slice(6, 9)}-**` : "—",
    },
    {
      key: "is_platform_admin",
      label: "Admin Plataforma",
      render: (val: boolean) => (
        <Badge variant={val ? "info" : "default"}>{val ? "Sim" : "Nao"}</Badge>
      ),
    },
    {
      key: "is_active",
      label: "Status",
      render: (val: boolean) => (
        <Badge variant={val ? "success" : "danger"}>{val ? "Ativo" : "Inativo"}</Badge>
      ),
    },
    {
      key: "actions",
      label: "Acoes",
      render: (_: any, row: User) => (
        <div className="flex items-center gap-2">
          <button onClick={(e) => { e.stopPropagation(); router.push(`/usuarios/${row.id}/edit`); }} className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg">
            <Pencil size={16} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(row); }} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg">
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <AppLayout title="Usuarios">
      <Card>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="relative w-full sm:w-80">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text" placeholder="Buscar usuarios..." value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none text-sm"
            />
          </div>
          <button onClick={() => router.push("/usuarios/new")} className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors">
            <Plus size={16} /> Novo Usuario
          </button>
        </div>
        <Table columns={columns} data={users} loading={loading} />
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t">
            <span className="text-sm text-gray-500">Pagina {page} de {totalPages} ({total} registros)</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50 hover:bg-gray-50">Anterior</button>
              <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50 hover:bg-gray-50">Proximo</button>
            </div>
          </div>
        )}
      </Card>
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Confirmar Exclusao" size="sm">
        <p className="text-gray-600 mb-4">Tem certeza que deseja excluir o usuario <strong>{deleteTarget?.name}</strong>?</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={handleDelete} disabled={deleting} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">{deleting ? "Excluindo..." : "Excluir"}</button>
        </div>
      </Modal>
    </AppLayout>
  );
}
