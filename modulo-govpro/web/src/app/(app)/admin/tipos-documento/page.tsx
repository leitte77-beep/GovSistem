"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import type { TipoDocumento, TipoDocumentoUpdate } from "@/types/govpro";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import Badge from "@/components/Badge";
import ConfirmModal from "@/components/ConfirmModal";
import CatalogFormModal, { CatalogField, CatalogFormValues } from "@/components/admin/CatalogFormModal";

const NIVEL_OPTIONS = [
  { value: "SIMPLES", label: "Simples" },
  { value: "AVANCADA", label: "Avançada" },
  { value: "QUALIFICADA", label: "Qualificada (ICP-Brasil)" },
];

export default function TiposDocumentoPage() {
  const [tipos, setTipos] = useState<TipoDocumento[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<TipoDocumento | null>(null);
  const [removendo, setRemovendo] = useState<TipoDocumento | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = () =>
    api
      .listTiposDocumento()
      .then(setTipos)
      .catch(() => toast.error("Falha ao carregar tipos de documento"))
      .finally(() => setLoading(false));

  useEffect(() => {
    carregar();
  }, []);

  const fields: CatalogField[] = [
    { name: "codigo", label: "Código", type: "text", required: false, disabled: Boolean(editando), span: 1, help: "Opcional. Se vazio, é gerado automaticamente a partir do nome." },
    { name: "nome", label: "Nome", type: "text", required: true, span: 1 },
    {
      name: "nivel_assinatura_minimo",
      label: "Nível de assinatura mínimo",
      type: "select",
      options: NIVEL_OPTIONS,
      span: 1,
    },
    { name: "numeracao", label: "Gera numeração automática", type: "checkbox", span: 1 },
  ];

  const abrirNovo = () => {
    setEditando(null);
    setModalAberto(true);
  };

  const valoresIniciais = (): CatalogFormValues =>
    editando
      ? {
          codigo: editando.codigo,
          nome: editando.nome,
          nivel_assinatura_minimo: editando.nivel_assinatura_minimo,
          numeracao: editando.numeracao,
        }
      : { codigo: "", nome: "", nivel_assinatura_minimo: "SIMPLES", numeracao: false };

  const salvar = async (values: CatalogFormValues) => {
    setSalvando(true);
    try {
      const payload = {
        nome: values.nome as string,
        nivel_assinatura_minimo: values.nivel_assinatura_minimo as string,
        numeracao: Boolean(values.numeracao),
      };
      if (editando) {
        await api.atualizarTipoDocumento(editando.id, payload as TipoDocumentoUpdate);
        toast.success("Tipo de documento atualizado");
      } else {
        await api.criarTipoDocumento({ codigo: (values.codigo as string)?.trim() || undefined, ...payload });
        toast.success("Tipo de documento criado");
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
      await api.removerTipoDocumento(removendo.id);
      toast.success("Tipo de documento desativado");
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
        title="Tipos de documento"
        subtitle="Catálogo de atos e documentos produzidos no processo. Regras de assinatura ficam na Matriz de Assinaturas."
        actions={
          <div className="flex items-center gap-3">
            <Link
              href="/admin/matriz-assinaturas"
              className="inline-flex items-center gap-2 h-11 px-4 border border-outline text-on-surface rounded-lg hover:bg-surface-container-high transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">border_color</span>
              Matriz de assinaturas
            </Link>
            <button
              onClick={abrirNovo}
              className="inline-flex items-center gap-2 h-11 px-4 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">add_circle</span>
              Novo tipo
            </button>
          </div>
        }
      />

      <div className="px-gutter max-w-container-max mx-auto">
        {loading ? (
          <div className="text-center py-16 text-on-surface-variant">Carregando…</div>
        ) : tipos.length === 0 ? (
          <EmptyState icon="description" title="Nenhum tipo de documento cadastrado" />
        ) : (
          <div className="bg-surface-container-lowest rounded-lg border border-outline-variant overflow-hidden overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-surface-container-high">
                <tr className="text-label-md font-label-md text-on-surface-variant">
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Assinatura mínima</th>
                  <th className="px-4 py-3">Numeração</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {tipos.map((t) => (
                  <tr key={t.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="px-4 py-3 font-mono text-body-sm text-primary">{t.codigo}</td>
                    <td className="px-4 py-3 text-body-md text-on-surface">{t.nome}</td>
                    <td className="px-4 py-3"><Badge tone="primary">{t.nivel_assinatura_minimo}</Badge></td>
                    <td className="px-4 py-3">
                      {t.numeracao ? <Badge tone="success">Sim</Badge> : <Badge tone="neutral">Não</Badge>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditando(t);
                            setModalAberto(true);
                          }}
                          aria-label={`Editar ${t.nome}`}
                          className="w-9 h-9 flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors"
                        >
                          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">edit</span>
                        </button>
                        <button
                          onClick={() => setRemovendo(t)}
                          aria-label={`Desativar ${t.nome}`}
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
        title={editando ? "Editar tipo de documento" : "Novo tipo de documento"}
        fields={fields}
        initialValues={valoresIniciais()}
        submitting={salvando}
        onSubmit={salvar}
        onCancel={() => setModalAberto(false)}
      />

      <ConfirmModal
        open={Boolean(removendo)}
        title="Desativar tipo de documento"
        message={`Deseja desativar "${removendo?.nome}"? Documentos já produzidos não são afetados.`}
        danger
        loading={salvando}
        onConfirm={remover}
        onCancel={() => setRemovendo(null)}
      />
    </div>
  );
}
