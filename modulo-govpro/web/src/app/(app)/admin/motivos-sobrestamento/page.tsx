"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import type { MotivoSobrestamento, MotivoSobrestamentoUpdate } from "@/types/govpro";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import ConfirmModal from "@/components/ConfirmModal";
import CatalogFormModal, { CatalogField, CatalogFormValues } from "@/components/admin/CatalogFormModal";

export default function MotivosSobrestamentoPage() {
  const [motivos, setMotivos] = useState<MotivoSobrestamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<MotivoSobrestamento | null>(null);
  const [removendo, setRemovendo] = useState<MotivoSobrestamento | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = () =>
    api
      .listMotivosSobrestamento()
      .then(setMotivos)
      .catch(() => toast.error("Falha ao carregar motivos de sobrestamento"))
      .finally(() => setLoading(false));

  useEffect(() => {
    carregar();
  }, []);

  const fields: CatalogField[] = [
    { name: "nome", label: "Nome", type: "text", required: true, span: 2 },
    { name: "descricao", label: "Descrição", type: "textarea", span: 2 },
  ];

  const abrirNovo = () => {
    setEditando(null);
    setModalAberto(true);
  };

  const valoresIniciais = (): CatalogFormValues =>
    editando ? { nome: editando.nome, descricao: editando.descricao ?? "" } : { nome: "", descricao: "" };

  const salvar = async (values: CatalogFormValues) => {
    setSalvando(true);
    try {
      const payload = { nome: values.nome as string, descricao: (values.descricao as string) || null };
      if (editando) {
        await api.atualizarMotivoSobrestamento(editando.id, payload as MotivoSobrestamentoUpdate);
        toast.success("Motivo atualizado");
      } else {
        await api.criarMotivoSobrestamento(payload);
        toast.success("Motivo criado");
      }
      setModalAberto(false);
      carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  };

  const remover = async () => {
    if (!removendo) return;
    setSalvando(true);
    try {
      await api.removerMotivoSobrestamento(removendo.id);
      toast.success("Motivo desativado");
      setRemovendo(null);
      carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao desativar");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="pb-stack-lg">
      <PageHeader
        title="Motivos de sobrestamento"
        subtitle="Catálogo de motivos para suspender a contagem de prazo de um processo."
        actions={
          <button
            onClick={abrirNovo}
            className="inline-flex items-center gap-2 h-11 px-4 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">add_circle</span>
            Novo motivo
          </button>
        }
      />

      <div className="px-gutter max-w-container-max mx-auto">
        {loading ? (
          <div className="text-center py-16 text-on-surface-variant">Carregando…</div>
        ) : motivos.length === 0 ? (
          <EmptyState icon="pause_circle" title="Nenhum motivo cadastrado" />
        ) : (
          <div className="bg-surface-container-lowest rounded-lg border border-outline-variant overflow-hidden">
            <ul className="divide-y divide-outline-variant">
              {motivos.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-surface-container-low transition-colors">
                  <div>
                    <p className="text-body-md text-on-surface">{m.nome}</p>
                    {m.descricao && <p className="text-body-sm text-on-surface-variant">{m.descricao}</p>}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => {
                        setEditando(m);
                        setModalAberto(true);
                      }}
                      aria-label={`Editar ${m.nome}`}
                      className="w-9 h-9 flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors"
                    >
                      <span className="material-symbols-outlined text-[20px]" aria-hidden="true">edit</span>
                    </button>
                    <button
                      onClick={() => setRemovendo(m)}
                      aria-label={`Desativar ${m.nome}`}
                      className="w-9 h-9 flex items-center justify-center text-error hover:bg-error-container rounded-lg transition-colors"
                    >
                      <span className="material-symbols-outlined text-[20px]" aria-hidden="true">delete</span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <CatalogFormModal
        open={modalAberto}
        title={editando ? "Editar motivo" : "Novo motivo"}
        fields={fields}
        initialValues={valoresIniciais()}
        submitting={salvando}
        onSubmit={salvar}
        onCancel={() => setModalAberto(false)}
      />

      <ConfirmModal
        open={Boolean(removendo)}
        title="Desativar motivo"
        message={`Deseja desativar "${removendo?.nome}"?`}
        danger
        loading={salvando}
        onConfirm={remover}
        onCancel={() => setRemovendo(null)}
      />
    </div>
  );
}
