"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { UserPlus, Search, Pencil, Trash2, Lock, Users, UserCheck, UserX } from "lucide-react";
import { api } from "@/lib/api";
import ConfirmModal from "@/components/ConfirmModal";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import type { User } from "@/types/user";

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  const fetchUsers = () => {
    setLoading(true);
    api.listUsers()
      .then(setUsers)
      .catch(() => toast.error("Erro ao carregar usuários"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.managed_by_saas) {
      toast.error("Usuários gerenciados pelo SaaS não podem ser excluídos no Diário");
      setDeleteTarget(null);
      return;
    }
    try {
      await api.deleteUser(deleteTarget.id);
      toast.success("Usuário excluído");
      setDeleteTarget(null);
      fetchUsers();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir");
    }
  };

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = users.filter((u) => u.is_active).length;
  const inactiveCount = users.length - activeCount;

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6 px-gutter py-8">
      <PageHeader
        eyebrow="Acesso"
        title="Usuários"
        description="Gerencie o acesso e as permissões dos usuários do sistema."
        actions={
          <Link href="/users/new" className="btn-primary">
            <UserPlus size={18} aria-hidden="true" />
            Novo usuário
          </Link>
        }
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card card-hover flex items-center gap-4 p-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-fixed text-primary">
            <Users size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-body-sm text-on-surface-variant">Total de usuários</p>
            <p className="text-headline-md text-on-surface">{users.length}</p>
          </div>
        </div>
        <div className="card card-hover flex items-center gap-4 p-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-success-container text-on-success-container">
            <UserCheck size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-body-sm text-on-surface-variant">Usuários ativos</p>
            <p className="text-headline-md text-on-surface">{activeCount}</p>
          </div>
        </div>
        <div className="card card-hover flex items-center gap-4 p-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-error-container text-on-error-container">
            <UserX size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="text-body-sm text-on-surface-variant">Usuários inativos</p>
            <p className="text-headline-md text-on-surface">{inactiveCount}</p>
          </div>
        </div>
      </section>

      <div className="card overflow-hidden">
        <div className="border-b border-outline-variant p-4">
          <div className="relative w-full sm:max-w-sm">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-outline" aria-hidden="true" />
            <input
              className="input pl-9"
              placeholder="Buscar por nome ou e-mail…"
              type="search"
              aria-label="Buscar usuários por nome ou e-mail"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16" role="status" aria-label="Carregando usuários">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={search ? "Nenhum usuário encontrado" : "Nenhum usuário cadastrado"}
            description={search ? "Tente alterar o termo da busca." : "Clique em “Novo usuário” para começar."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">Lista de usuários do sistema</caption>
              <thead>
                <tr className="bg-surface-container-low">
                  <th scope="col" className="px-6 py-3 text-label-md text-on-surface-variant">Usuário</th>
                  <th scope="col" className="px-6 py-3 text-label-md text-on-surface-variant">E-mail</th>
                  <th scope="col" className="px-6 py-3 text-center text-label-md text-on-surface-variant">Status</th>
                  <th scope="col" className="px-6 py-3 text-label-md text-on-surface-variant">Data de criação</th>
                  <th scope="col" className="px-6 py-3 text-right text-label-md text-on-surface-variant">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {filtered.map((u) => {
                  const initials = u.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
                  const canManage = !u.managed_by_saas;
                  return (
                    <tr key={u.id} className="group transition-colors hover:bg-surface-container-low">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-body-sm font-bold ${u.is_active ? "bg-secondary-container text-on-secondary-container" : "bg-surface-container-highest text-on-surface-variant"}`}>
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-body-md font-semibold text-on-surface">{u.name}</p>
                              {u.managed_by_saas && (
                                <span className="inline-flex items-center rounded-full bg-primary-fixed px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                                  SaaS
                                </span>
                              )}
                            </div>
                            <p className="text-body-sm text-on-surface-variant">
                              {u.managed_by_saas ? "Gerenciado pela plataforma" : `ID: #${u.id.slice(0, 5)}`}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-body-md text-on-surface">{u.email}</td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-body-sm font-semibold ${u.is_active ? "bg-secondary-container text-on-secondary-container" : "bg-error-container text-on-error-container"}`}>
                          <span className={`h-2 w-2 rounded-full ${u.is_active ? "bg-secondary" : "bg-error"}`} aria-hidden="true" />
                          {u.is_active ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-body-md text-on-surface">
                        {new Date(u.created_at).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                          {canManage ? (
                            <>
                              <Link
                                href={`/users/${u.id}/edit`}
                                className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
                                aria-label={`Editar ${u.name}`}
                                title="Editar"
                              >
                                <Pencil size={16} aria-hidden="true" />
                              </Link>
                              <button
                                onClick={() => setDeleteTarget(u)}
                                className="rounded-full p-2 text-error transition-colors hover:bg-error-container"
                                aria-label={`Excluir ${u.name}`}
                                title="Excluir"
                              >
                                <Trash2 size={16} aria-hidden="true" />
                              </button>
                            </>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-3 py-1 text-body-sm text-on-surface-variant">
                              <Lock size={13} aria-hidden="true" />
                              Bloqueado
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between border-t border-outline-variant bg-surface-container-low px-6 py-3">
            <p className="text-body-sm text-on-surface-variant">
              Mostrando {filtered.length} de {users.length} usuário(s)
            </p>
          </div>
        )}
      </div>

      <ConfirmModal
        open={deleteTarget !== null}
        title="Excluir usuário"
        message={
          deleteTarget?.managed_by_saas
            ? "Este usuário é gerenciado pelo SaaS e não pode ser excluído no Diário."
            : `Tem certeza que deseja excluir ${deleteTarget?.name}? Esta ação não pode ser desfeita.`
        }
        confirmLabel="Excluir"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
