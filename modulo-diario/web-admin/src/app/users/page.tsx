"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import ConfirmModal from "@/components/ConfirmModal";
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

  return (
    <div className="p-8 max-w-[1400px] mx-auto w-full">
      <section className="flex flex-col md:flex-row md:items-end justify-between mb-stack-md gap-4">
        <div>
          <h1 className="text-headline-lg font-headline-lg text-primary mb-1">Usuários</h1>
          <p className="text-body-md text-on-surface-variant">Gerencie o acesso e permissões dos usuários do sistema.</p>
        </div>
        <Link
          href="/users/new"
          className="bg-primary text-on-primary px-6 py-3 rounded-lg flex items-center gap-2 font-bold shadow-sm hover:opacity-90 active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined">person_add</span>
          + Novo Usuário
        </Link>
      </section>

      <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden">
        <div className="p-6 border-b border-outline-variant flex flex-col md:flex-row gap-4 justify-between items-center bg-surface-container-low/30">
          <div className="relative w-full md:w-96">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
            <input
              className="w-full pl-10 pr-4 py-3 bg-white border border-outline-variant rounded-lg text-body-md focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
              placeholder="Buscar por nome ou e-mail..."
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-3 border border-outline-variant rounded-lg text-body-md text-on-surface hover:bg-surface-container-high transition-colors">
              <span className="material-symbols-outlined">filter_list</span>
              Filtros
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <span className="material-symbols-outlined text-4xl animate-spin text-primary">progress_activity</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <span className="material-symbols-outlined text-5xl text-outline mb-4 block">group_off</span>
            <p className="text-lg font-semibold text-on-surface mb-1">
              {search ? "Nenhum usuário encontrado" : "Nenhum usuário cadastrado"}
            </p>
            <p className="text-sm text-on-surface-variant">
              {search ? "Tente alterar o termo da busca" : "Clique em \"Novo Usuário\" para começar"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-high/50">
                  <th className="px-6 py-4 text-label-md font-label-md text-on-surface-variant uppercase tracking-wider">Usuário</th>
                  <th className="px-6 py-4 text-label-md font-label-md text-on-surface-variant uppercase tracking-wider">E-mail</th>
                  <th className="px-6 py-4 text-label-md font-label-md text-on-surface-variant uppercase tracking-wider text-center">Status</th>
                  <th className="px-6 py-4 text-label-md font-label-md text-on-surface-variant uppercase tracking-wider">Data de Criação</th>
                  <th className="px-6 py-4 text-label-md font-label-md text-on-surface-variant uppercase tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {filtered.map((u) => {
                  const initials = u.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
                  const canManage = !u.managed_by_saas;
                  return (
                    <tr key={u.id} className="hover:bg-surface-container-low/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${u.is_active ? "bg-secondary-container text-on-secondary-container" : "bg-surface-container-highest text-on-surface"}`}>
                            {initials}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-body-md font-bold text-on-surface">{u.name}</p>
                              {u.managed_by_saas && (
                                <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                                  SaaS
                                </span>
                              )}
                            </div>
                            <p className="text-label-md text-on-surface-variant">
                              {u.managed_by_saas ? "Gerenciado pela plataforma" : `ID: #${u.id.slice(0, 5)}`}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-body-md text-on-surface">{u.email}</td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-label-md font-label-md ${u.is_active ? "bg-secondary-container text-on-secondary-container" : "bg-error-container text-on-error-container"}`}>
                          <span className={`w-2 h-2 rounded-full ${u.is_active ? "bg-secondary" : "bg-error"}`} />
                          {u.is_active ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-body-md text-on-surface">
                        {new Date(u.created_at).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                          {canManage ? (
                            <>
                              <Link
                                href={`/users/${u.id}/edit`}
                                className="p-2 hover:bg-surface-container-high rounded-full transition-colors"
                                title="Editar"
                              >
                                <span className="material-symbols-outlined text-on-surface-variant">edit</span>
                              </Link>
                              <button
                                onClick={() => setDeleteTarget(u)}
                                className="p-2 hover:bg-error-container/20 rounded-full transition-colors"
                                title="Excluir"
                              >
                                <span className="material-symbols-outlined text-error">delete</span>
                              </button>
                            </>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-3 py-1 text-label-md text-on-surface-variant">
                              <span className="material-symbols-outlined text-sm">lock</span>
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
          <div className="px-6 py-4 bg-surface-container-low/30 flex items-center justify-between border-t border-outline-variant">
            <p className="text-body-sm text-on-surface-variant">
              Mostrando {filtered.length} de {users.length} usuário(s)
            </p>
          </div>
        )}
      </div>

      <section className="mt-stack-md grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <span className="p-3 bg-primary-container/10 rounded-lg">
              <span className="material-symbols-outlined text-primary">group</span>
            </span>
            <span className="text-secondary font-bold text-sm flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">trending_up</span>
              +{users.length}
            </span>
          </div>
          <p className="text-body-md text-on-surface-variant mb-1">Total de Usuários</p>
          <h3 className="text-headline-md font-headline-md text-on-surface font-bold">{users.length}</h3>
        </div>
        <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <span className="p-3 bg-secondary-container/10 rounded-lg">
              <span className="material-symbols-outlined text-secondary">verified_user</span>
            </span>
          </div>
          <p className="text-body-md text-on-surface-variant mb-1">Usuários Ativos</p>
          <h3 className="text-headline-md font-headline-md text-on-surface font-bold">{activeCount}</h3>
        </div>
        <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <span className="p-3 bg-tertiary-container/10 rounded-lg">
              <span className="material-symbols-outlined text-tertiary-container">admin_panel_settings</span>
            </span>
          </div>
          <p className="text-body-md text-on-surface-variant mb-1">Cadastrados</p>
          <h3 className="text-headline-md font-headline-md text-on-surface font-bold">{users.length}</h3>
        </div>
      </section>

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
