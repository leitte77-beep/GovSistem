"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import type { TipoDocumento } from "@/types/govpro";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import Badge from "@/components/Badge";
import CatalogFormModal, { CatalogField, CatalogFormValues } from "@/components/admin/CatalogFormModal";

const PAPEL_OPTIONS = [
  { value: "SERVIDOR", label: "Servidor" },
  { value: "CHEFE_UNIDADE", label: "Chefe de unidade" },
  { value: "PROTOCOLO", label: "Protocolo" },
  { value: "AUTORIDADE_SIGNATARIA", label: "Autoridade signatária" },
  { value: "GESTOR_SIGILO", label: "Gestor de sigilo" },
  { value: "ARQUIVISTA", label: "Arquivista" },
  { value: "DPO", label: "Encarregado (DPO)" },
  { value: "ADMIN", label: "Administrador" },
];

const NIVEL_OPTIONS = [
  { value: "SIMPLES", label: "Simples" },
  { value: "AVANCADA", label: "Avançada" },
  { value: "QUALIFICADA", label: "Qualificada (ICP-Brasil)" },
];

export default function MatrizAssinaturasPage() {
  const [tipos, setTipos] = useState<TipoDocumento[]>([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<TipoDocumento | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = () =>
    api
      .listMatrizAssinaturas()
      .then(setTipos)
      .catch(() => toast.error("Falha ao carregar matriz de assinaturas"))
      .finally(() => setLoading(false));

  useEffect(() => {
    carregar();
  }, []);

  const fields: CatalogField[] = [
    { name: "nivel_assinatura_minimo", label: "Nível de assinatura mínimo", type: "select", options: NIVEL_OPTIONS, span: 2 },
    {
      name: "perfis_autorizados",
      label: "Perfis autorizados a assinar (vazio = qualquer perfil atuante)",
      type: "checkbox-group",
      options: PAPEL_OPTIONS,
      span: 2,
    },
    { name: "qtd_assinaturas_minima", label: "Quantidade mínima de assinaturas", type: "number", span: 1 },
    { name: "assinatura_sequencial", label: "Assinatura sequencial (em cadeia)", type: "checkbox", span: 1 },
    { name: "exige_assinatura_externa", label: "Exige assinatura externa (representante/cidadão)", type: "checkbox", span: 1 },
    { name: "permite_bloco", label: "Permite assinatura em bloco (lote)", type: "checkbox", span: 1 },
    { name: "fundamento_normativo", label: "Fundamento normativo", type: "textarea", span: 2 },
  ];

  const valoresIniciais = (): CatalogFormValues =>
    editando
      ? {
          nivel_assinatura_minimo: editando.nivel_assinatura_minimo,
          perfis_autorizados: editando.perfis_autorizados ?? [],
          qtd_assinaturas_minima: editando.qtd_assinaturas_minima ?? 1,
          assinatura_sequencial: editando.assinatura_sequencial ?? false,
          exige_assinatura_externa: editando.exige_assinatura_externa ?? false,
          permite_bloco: editando.permite_bloco ?? true,
          fundamento_normativo: editando.fundamento_normativo ?? "",
        }
      : {};

  const salvar = async (values: CatalogFormValues) => {
    if (!editando) return;
    setSalvando(true);
    try {
      await api.atualizarMatrizAssinatura(editando.id, {
        nivel_assinatura_minimo: values.nivel_assinatura_minimo as string,
        perfis_autorizados: (values.perfis_autorizados as string[]) ?? [],
        qtd_assinaturas_minima: Number(values.qtd_assinaturas_minima) || 1,
        assinatura_sequencial: Boolean(values.assinatura_sequencial),
        exige_assinatura_externa: Boolean(values.exige_assinatura_externa),
        permite_bloco: Boolean(values.permite_bloco),
        fundamento_normativo: (values.fundamento_normativo as string) || null,
      });
      toast.success("Matriz de assinatura atualizada");
      setEditando(null);
      carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="pb-stack-lg">
      <PageHeader
        title="Matriz de assinaturas"
        subtitle="Define quem pode assinar cada tipo de documento, quantos signatários e em que ordem (Lei 14.063/2020)."
      />

      <div className="px-gutter max-w-container-max mx-auto">
        {loading ? (
          <div className="text-center py-16 text-on-surface-variant">Carregando…</div>
        ) : tipos.length === 0 ? (
          <EmptyState icon="border_color" title="Nenhum tipo de documento cadastrado" />
        ) : (
          <div className="bg-surface-container-lowest rounded-lg border border-outline-variant overflow-hidden overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-surface-container-high">
                <tr className="text-label-md font-label-md text-on-surface-variant">
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Nível mínimo</th>
                  <th className="px-4 py-3">Perfis autorizados</th>
                  <th className="px-4 py-3">Qtd. mínima</th>
                  <th className="px-4 py-3">Sequencial</th>
                  <th className="px-4 py-3">Bloco</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {tipos.map((t) => (
                  <tr key={t.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="px-4 py-3 text-body-md text-on-surface">
                      {t.nome} <span className="text-body-sm text-on-surface-variant">({t.codigo})</span>
                    </td>
                    <td className="px-4 py-3"><Badge tone="primary">{t.nivel_assinatura_minimo}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {t.perfis_autorizados && t.perfis_autorizados.length > 0 ? (
                          t.perfis_autorizados.map((p) => <Badge key={p} tone="neutral">{p}</Badge>)
                        ) : (
                          <span className="text-body-sm text-on-surface-variant">Qualquer perfil</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-body-sm">{t.qtd_assinaturas_minima ?? 1}</td>
                    <td className="px-4 py-3">
                      {t.assinatura_sequencial ? <Badge tone="warning">Sim</Badge> : <Badge tone="neutral">Não</Badge>}
                    </td>
                    <td className="px-4 py-3">
                      {t.permite_bloco ? <Badge tone="success">Sim</Badge> : <Badge tone="neutral">Não</Badge>}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setEditando(t)}
                        aria-label={`Editar matriz de ${t.nome}`}
                        className="w-9 h-9 flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors"
                      >
                        <span className="material-symbols-outlined text-[20px]" aria-hidden="true">edit</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CatalogFormModal
        open={Boolean(editando)}
        title={`Matriz de assinatura — ${editando?.nome ?? ""}`}
        fields={fields}
        initialValues={valoresIniciais()}
        submitting={salvando}
        onSubmit={salvar}
        onCancel={() => setEditando(null)}
      />
    </div>
  );
}
