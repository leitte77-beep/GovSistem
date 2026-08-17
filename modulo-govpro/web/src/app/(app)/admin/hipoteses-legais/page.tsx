"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import type { HipoteseLegal, HipoteseLegalUpdate } from "@/types/govpro";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import Badge from "@/components/Badge";
import ConfirmModal from "@/components/ConfirmModal";
import CatalogFormModal, { CatalogField, CatalogFormValues } from "@/components/admin/CatalogFormModal";

const GRAU_OPTIONS = [
  { value: "RESERVADO", label: "Reservado (até 5 anos)" },
  { value: "SECRETO", label: "Secreto (até 15 anos)" },
  { value: "ULTRASSECRETO", label: "Ultrassecreto (até 25 anos)" },
];

export default function HipotesesLegaisPage() {
  const [hipoteses, setHipoteses] = useState<HipoteseLegal[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<HipoteseLegal | null>(null);
  const [removendo, setRemovendo] = useState<HipoteseLegal | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = () =>
    api
      .listHipotesesLegais()
      .then(setHipoteses)
      .catch(() => toast.error("Falha ao carregar hipóteses legais"))
      .finally(() => setLoading(false));

  useEffect(() => {
    carregar();
  }, []);

  const fields: CatalogField[] = [
    { name: "codigo", label: "Código", type: "text", required: true, disabled: Boolean(editando), span: 1 },
    { name: "grau_sigilo", label: "Grau (LAI art. 24, quando aplicável)", type: "select", options: GRAU_OPTIONS, span: 1 },
    { name: "descricao", label: "Descrição", type: "textarea", required: true, span: 2 },
    { name: "base_legal", label: "Base legal", type: "textarea", span: 2 },
    { name: "prazo_sigilo_anos", label: "Prazo de sigilo (anos)", type: "number", span: 1 },
  ];

  const abrirNovo = () => {
    setEditando(null);
    setModalAberto(true);
  };

  const valoresIniciais = (): CatalogFormValues =>
    editando
      ? {
          codigo: editando.codigo,
          descricao: editando.descricao,
          base_legal: editando.base_legal ?? "",
          grau_sigilo: editando.grau_sigilo ?? "",
          prazo_sigilo_anos: editando.prazo_sigilo_anos ?? null,
        }
      : { codigo: "", descricao: "", base_legal: "", grau_sigilo: "", prazo_sigilo_anos: null };

  const salvar = async (values: CatalogFormValues) => {
    setSalvando(true);
    try {
      const payload = {
        descricao: values.descricao as string,
        base_legal: (values.base_legal as string) || null,
        grau_sigilo: (values.grau_sigilo as string) || null,
        prazo_sigilo_anos: values.prazo_sigilo_anos as number | null,
      };
      if (editando) {
        await api.atualizarHipoteseLegal(editando.id, payload as HipoteseLegalUpdate);
        toast.success("Hipótese legal atualizada");
      } else {
        await api.criarHipoteseLegal({ codigo: values.codigo as string, ...payload });
        toast.success("Hipótese legal criada");
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
      await api.removerHipoteseLegal(removendo.id);
      toast.success("Hipótese legal desativada");
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
        title="Hipóteses legais de restrição"
        subtitle="Fundamentos para restrição de acesso a processos e documentos (LAI art. 23/31)."
        actions={
          <button
            onClick={abrirNovo}
            className="inline-flex items-center gap-2 h-11 px-4 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">add_circle</span>
            Nova hipótese
          </button>
        }
      />

      <div className="px-gutter max-w-container-max mx-auto">
        {loading ? (
          <div className="text-center py-16 text-on-surface-variant">Carregando…</div>
        ) : hipoteses.length === 0 ? (
          <EmptyState icon="gavel" title="Nenhuma hipótese legal cadastrada" />
        ) : (
          <div className="bg-surface-container-lowest rounded-lg border border-outline-variant overflow-hidden overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-surface-container-high">
                <tr className="text-label-md font-label-md text-on-surface-variant">
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3">Grau</th>
                  <th className="px-4 py-3">Prazo (anos)</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {hipoteses.map((h) => (
                  <tr key={h.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="px-4 py-3 font-mono text-body-sm text-primary">{h.codigo}</td>
                    <td className="px-4 py-3 text-body-md text-on-surface">{h.descricao}</td>
                    <td className="px-4 py-3">
                      {h.grau_sigilo ? <Badge tone="error">{h.grau_sigilo}</Badge> : <Badge tone="neutral">—</Badge>}
                    </td>
                    <td className="px-4 py-3 text-body-sm">{h.prazo_sigilo_anos ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditando(h);
                            setModalAberto(true);
                          }}
                          aria-label={`Editar ${h.codigo}`}
                          className="w-9 h-9 flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors"
                        >
                          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">edit</span>
                        </button>
                        <button
                          onClick={() => setRemovendo(h)}
                          aria-label={`Desativar ${h.codigo}`}
                          className="w-9 h-9 flex items-center justify-center text-error hover:bg-error-container rounded-lg transition-colors"
                        >
                          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CatalogFormModal
        open={modalAberto}
        title={editando ? "Editar hipótese legal" : "Nova hipótese legal"}
        fields={fields}
        initialValues={valoresIniciais()}
        submitting={salvando}
        onSubmit={salvar}
        onCancel={() => setModalAberto(false)}
      />

      <ConfirmModal
        open={Boolean(removendo)}
        title="Desativar hipótese legal"
        message={`Deseja desativar "${removendo?.codigo}"? Classificações já registradas não são afetadas.`}
        danger
        loading={salvando}
        onConfirm={remover}
        onCancel={() => setRemovendo(null)}
      />
    </div>
  );
}
