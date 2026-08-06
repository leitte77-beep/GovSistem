"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Setor } from "@/types/govtask";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { notify } from "@/components/ui/Toast";
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  Save,
  Bell,
  Mail,
  Smartphone,
  Settings,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";

export default function ConfiguracoesPage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("ADMIN");

  const [setores, setSetores] = useState<Setor[]>([]);
  const [loadingSetores, setLoadingSetores] = useState(true);

  const [showAdd, setShowAdd] = useState(false);
  const [newSetor, setNewSetor] = useState({ nome: "", sigla: "", descricao: "" });
  const [savingSetor, setSavingSetor] = useState(false);

  const [editId, setEditId] = useState<string | null>(null);
  const [editNome, setEditNome] = useState("");
  const [editSigla, setEditSigla] = useState("");
  const [editDescricao, setEditDescricao] = useState("");

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [notifReminder, setNotifReminder] = useState({
    d7: true,
    d3: true,
    d1: true,
    sameDay: true,
  });
  const [escalonarAssessor, setEscalonarAssessor] = useState(true);
  const [canais, setCanais] = useState({ inApp: true, email: false });

  const loadSetores = async () => {
    try {
      const data = await api.listSetores();
      setSetores(data);
    } catch (e: any) {
      notify.error(e.message || "Erro ao carregar setores");
    } finally {
      setLoadingSetores(false);
    }
  };

  useEffect(() => {
    if (isAdmin) loadSetores();
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <EmptyState
        icon="alert-triangle"
        title="Acesso restrito"
        description="Apenas administradores podem acessar as configurações."
      />
    );
  }

  const handleAddSetor = async () => {
    if (!newSetor.nome.trim()) {
      notify.error("Informe o nome do setor");
      return;
    }
    setSavingSetor(true);
    try {
      await api.createSetor({
        nome: newSetor.nome.trim(),
        sigla: newSetor.sigla.trim() || undefined,
        descricao: newSetor.descricao.trim() || undefined,
      });
      notify.success("Setor criado!");
      setShowAdd(false);
      setNewSetor({ nome: "", sigla: "", descricao: "" });
      loadSetores();
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setSavingSetor(false);
    }
  };

  const startEdit = (s: Setor) => {
    setEditId(s.id);
    setEditNome(s.nome);
    setEditSigla(s.sigla || "");
    setEditDescricao(s.descricao || "");
  };

  const handleEditSave = async () => {
    if (!editId || !editNome.trim()) return;
    try {
      await api.updateSetor(editId, {
        nome: editNome.trim(),
        sigla: editSigla.trim() || null,
        descricao: editDescricao.trim() || null,
      });
      notify.success("Setor atualizado!");
      setEditId(null);
      loadSetores();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const handleToggleAtivo = async (s: Setor) => {
    try {
      await api.updateSetor(s.id, { ativo: !s.ativo });
      loadSetores();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.deleteSetor(deleteId);
      notify.success("Setor excluído!");
      setDeleteId(null);
      loadSetores();
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveNotif = () => {
    const settings = {
      reminderDays: notifReminder,
      escalonarAssessor,
      canais,
    };
    if (typeof window !== "undefined") {
      localStorage.setItem("govtask_notif_settings", JSON.stringify(settings));
    }
    notify.success("Configurações de notificação salvas!");
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <PageHeader
        title="Configurações"
        description="Gerencie setores e parâmetros do sistema"
      />

      {/* Setores */}
      <Card padding="p-6" className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-text-title flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            Setores
          </h2>
          <Button
            variant={showAdd ? "secondary" : "primary"}
            size="sm"
            icon={showAdd ? X : Plus}
            onClick={() => setShowAdd(!showAdd)}
          >
            {showAdd ? "Cancelar" : "Novo Setor"}
          </Button>
        </div>

        {showAdd && (
          <div className="p-4 bg-surface-bg rounded-card border border-surface-border space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-meta text-text-subtle mb-1">Nome *</label>
                <input
                  type="text"
                  value={newSetor.nome}
                  onChange={(e) => setNewSetor({ ...newSetor, nome: e.target.value })}
                  placeholder="Nome do setor"
                  className="w-full border border-surface-border rounded-btn px-3 py-1.5 text-body-sm focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                />
              </div>
              <div>
                <label className="block text-meta text-text-subtle mb-1">Sigla</label>
                <input
                  type="text"
                  value={newSetor.sigla}
                  onChange={(e) => setNewSetor({ ...newSetor, sigla: e.target.value })}
                  placeholder="Ex: ENG"
                  className="w-full border border-surface-border rounded-btn px-3 py-1.5 text-body-sm focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                />
              </div>
              <div>
                <label className="block text-meta text-text-subtle mb-1">Descrição</label>
                <input
                  type="text"
                  value={newSetor.descricao}
                  onChange={(e) => setNewSetor({ ...newSetor, descricao: e.target.value })}
                  placeholder="Descrição breve"
                  className="w-full border border-surface-border rounded-btn px-3 py-1.5 text-body-sm focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" icon={Save} loading={savingSetor} onClick={handleAddSetor}>
                Adicionar
              </Button>
            </div>
          </div>
        )}

        {loadingSetores ? (
          <div className="space-y-2">
            <Skeleton variant="text" className="h-10" />
            <Skeleton variant="text" className="h-10" />
            <Skeleton variant="text" className="h-10" />
          </div>
        ) : setores.length === 0 ? (
          <p className="text-body-sm text-text-subtle py-4 text-center">
            Nenhum setor cadastrado. Crie setores para organizar tarefas.
          </p>
        ) : (
          <div className="space-y-2">
            {setores.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 p-3 rounded-btn border border-surface-border hover:bg-surface-bg transition-colors"
              >
                {editId === s.id ? (
                  <>
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={editNome}
                        onChange={(e) => setEditNome(e.target.value)}
                        className="border border-surface-border rounded-btn px-2 py-1 text-body-sm focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                      />
                      <input
                        type="text"
                        value={editSigla}
                        onChange={(e) => setEditSigla(e.target.value)}
                        className="border border-surface-border rounded-btn px-2 py-1 text-body-sm focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                      />
                      <input
                        type="text"
                        value={editDescricao}
                        onChange={(e) => setEditDescricao(e.target.value)}
                        className="border border-surface-border rounded-btn px-2 py-1 text-body-sm focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                      />
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="sm" icon={Check} onClick={handleEditSave}>{""}</Button>
                      <Button variant="ghost" size="sm" icon={X} onClick={() => setEditId(null)}>{""}</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="text-body-sm font-medium text-text-title">
                        {s.nome}
                        {s.sigla && (
                          <span className="ml-2 text-meta text-text-subtle">({s.sigla})</span>
                        )}
                      </p>
                      {s.descricao && (
                        <p className="text-meta text-text-subtle">{s.descricao}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleAtivo(s)}
                        className={`px-2 py-1 rounded text-meta font-medium transition-colors ${
                          s.ativo
                            ? "bg-[#067647]/10 text-[#067647]"
                            : "bg-[#667085]/10 text-[#667085]"
                        }`}
                      >
                        {s.ativo ? "Ativo" : "Inativo"}
                      </button>
                      <Button variant="ghost" size="sm" icon={Pencil} onClick={() => startEdit(s)}>{""}</Button>
                      <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setDeleteId(s.id)}>{""}</Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Parâmetros de Notificação */}
      <Card padding="p-6" className="space-y-6">
        <h2 className="font-semibold text-text-title flex items-center gap-2">
          <Bell className="w-5 h-5" />
          Parâmetros de Notificação
        </h2>

        <div>
          <h3 className="text-body-sm font-medium text-text-title mb-3">
            Lembretes de Prazo
          </h3>
          <div className="space-y-3">
            {[
              { key: "d7", label: "7 dias antes do vencimento" },
              { key: "d3", label: "3 dias antes do vencimento" },
              { key: "d1", label: "1 dia antes do vencimento" },
              { key: "sameDay", label: "No dia do vencimento" },
            ].map((item) => (
              <label
                key={item.key}
                className="flex items-center justify-between py-2 px-3 rounded-btn hover:bg-surface-bg transition-colors cursor-pointer"
              >
                <span className="text-body-sm text-text-body">{item.label}</span>
                <input
                  type="checkbox"
                  checked={(notifReminder as any)[item.key]}
                  onChange={(e) =>
                    setNotifReminder({ ...notifReminder, [item.key]: e.target.checked })
                  }
                  className="w-4 h-4 rounded border-border text-[#1D4ED8] focus:ring-[#1D4ED8]"
                />
              </label>
            ))}
          </div>
        </div>

        <div className="border-t border-surface-border pt-6">
          <h3 className="text-body-sm font-medium text-text-title mb-3">
            Escalonamento
          </h3>
          <label className="flex items-center justify-between py-2 px-3 rounded-btn hover:bg-surface-bg transition-colors cursor-pointer">
            <div>
              <span className="text-body-sm text-text-body">Escalonar ao assessor quando atrasado</span>
              <p className="text-meta text-text-subtle">
                Notificar o assessor automaticamente quando uma tarefa estiver atrasada
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEscalonarAssessor(!escalonarAssessor)}
              className="text-text-subtle hover:text-text-body transition-colors"
            >
              {escalonarAssessor ? (
                <ToggleRight className="w-6 h-6 text-[#067647]" />
              ) : (
                <ToggleLeft className="w-6 h-6" />
              )}
            </button>
          </label>
        </div>

        <div className="border-t border-surface-border pt-6">
          <h3 className="text-body-sm font-medium text-text-title mb-3">
            Canais de Notificação
          </h3>
          <div className="space-y-3">
            <label className="flex items-center justify-between py-2 px-3 rounded-btn bg-surface-bg/50 cursor-not-allowed">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-text-subtle" />
                <span className="text-body-sm text-text-body">In-app</span>
              </div>
              <span className="text-meta text-text-subtle">Sempre ativo</span>
            </label>
            <label className="flex items-center justify-between py-2 px-3 rounded-btn hover:bg-surface-bg transition-colors cursor-pointer">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-text-subtle" />
                <span className="text-body-sm text-text-body">Email</span>
              </div>
              <button
                type="button"
                onClick={() => setCanais({ ...canais, email: !canais.email })}
                className="text-text-subtle hover:text-text-body transition-colors"
              >
                {canais.email ? (
                  <ToggleRight className="w-6 h-6 text-[#067647]" />
                ) : (
                  <ToggleLeft className="w-6 h-6" />
                )}
              </button>
            </label>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="primary" icon={Save} onClick={handleSaveNotif}>
            Salvar Configurações
          </Button>
        </div>
      </Card>

      <ConfirmModal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Excluir Setor"
        message="Tem certeza que deseja excluir este setor? Tarefas vinculadas a este setor não serão afetadas."
        confirmLabel="Excluir"
        loading={deleting}
      />
    </div>
  );
}
