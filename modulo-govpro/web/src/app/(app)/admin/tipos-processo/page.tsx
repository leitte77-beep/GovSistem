"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import type { NivelAcesso, TipoProcesso, TipoProcessoUpdate, Unidade } from "@/types/govpro";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import Badge from "@/components/Badge";
import ConfirmModal from "@/components/ConfirmModal";
import CatalogFormModal, { CatalogField, CatalogFormValues } from "@/components/admin/CatalogFormModal";

const NIVEL_OPTIONS = [
  { value: "PUBLICO", label: "Público" },
  { value: "RESTRITO", label: "Restrito" },
  { value: "SIGILOSO", label: "Sigiloso" },
];

export default function TiposProcessoPage() {
  const [tipos, setTipos] = useState<TipoProcesso[]>([]);
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<TipoProcesso | null>(null);
  const [removendo, setRemovendo] = useState<TipoProcesso | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = () =>
    Promise.all([api.listTiposProcesso(), api.listUnidades()])
      .then(([t, u]) => {
        setTipos(t);
        setUnidades(u);
      })
      .catch(() => toast.error("Falha ao carregar tipos de processo"))
      .finally(() => setLoading(false));

  useEffect(() => {
    carregar();
  }, []);

  const fields: CatalogField[] = [
    { name: "codigo", label: "Código", type: "text", required: false, disabled: Boolean(editando), span: 1, help: "Opcional. Se vazio, é gerado automaticamente a partir do nome." },
    { name: "nome", label: "Nome", type: "text", required: true, span: 1 },
    { name: "descricao", label: "Descrição", type: "textarea", span: 2 },
    {
      name: "niveis_permitidos",
      label: "Níveis de acesso permitidos",
      type: "checkbox-group",
      options: NIVEL_OPTIONS,
      span: 2,
    },
    {
      name: "unidade_destino_padrao_id",
      label: "Unidade de destino padrão (roteamento)",
      type: "select",
      options: unidades.map((u) => ({ value: u.id, label: `${u.nome} (${u.sigla})` })),
      span: 1,
    },
    { name: "prazo_legal_dias", label: "Prazo legal (dias)", type: "number", span: 1 },
    { name: "base_legal", label: "Base legal", type: "textarea", span: 2 },
    { name: "publico_externo", label: "Permite peticionamento pelo cidadão", type: "checkbox", span: 2 },
  ];

  const abrirNovo = () => {
    setEditando(null);
    setModalAberto(true);
  };

  const abrirEdicao = (t: TipoProcesso) => {
    setEditando(t);
    setModalAberto(true);
  };

  const valoresIniciais = (): CatalogFormValues => {
    if (!editando) {
      return {
        codigo: "",
        nome: "",
        descricao: "",
        niveis_permitidos: ["PUBLICO"],
        unidade_destino_padrao_id: "",
        prazo_legal_dias: null,
        base_legal: "",
        publico_externo: false,
      };
    }
    return {
      codigo: editando.codigo,
      nome: editando.nome,
      descricao: editando.descricao ?? "",
      niveis_permitidos: editando.niveis_permitidos,
      unidade_destino_padrao_id: editando.unidade_destino_padrao_id ?? "",
      prazo_legal_dias: editando.prazo_legal_dias ?? null,
      base_legal: editando.base_legal ?? "",
      publico_externo: editando.publico_externo,
    };
  };

  const salvar = async (values: CatalogFormValues) => {
    setSalvando(true);
    try {
      const payload = {
        nome: values.nome as string,
        descricao: (values.descricao as string) || null,
        niveis_permitidos: ((values.niveis_permitidos as string[])?.length
          ? (values.niveis_permitidos as string[])
          : ["PUBLICO"]) as NivelAcesso[],
        unidade_destino_padrao_id: (values.unidade_destino_padrao_id as string) || null,
        prazo_legal_dias: values.prazo_legal_dias as number | null,
        base_legal: (values.base_legal as string) || null,
        publico_externo: Boolean(values.publico_externo),
      };
      if (editando) {
        await api.atualizarTipoProcesso(editando.id, payload as TipoProcessoUpdate);
        toast.success("Tipo de processo atualizado");
      } else {
        await api.criarTipoProcesso({ codigo: (values.codigo as string)?.trim() || undefined, ...payload });
        toast.success("Tipo de processo criado");
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
      await api.removerTipoProcesso(removendo.id);
      toast.success("Tipo de processo desativado");
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
        title="Tipos de processo"
        subtitle="Catálogo de tipos de processo administrativo do órgão."
        actions={
          <button
            onClick={abrirNovo}
            className="inline-flex items-center gap-2 h-11 px-4 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">add_circle</span>
            Novo tipo
          </button>
        }
      />

      <div className="px-gutter max-w-container-max mx-auto">
        {loading ? (
          <div className="text-center py-16 text-on-surface-variant">Carregando…</div>
        ) : tipos.length === 0 ? (
          <EmptyState icon="category" title="Nenhum tipo de processo cadastrado" />
        ) : (
          <div className="bg-surface-container-lowest rounded-lg border border-outline-variant overflow-hidden overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-surface-container-high">
                <tr className="text-label-md font-label-md text-on-surface-variant">
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Níveis permitidos</th>
                  <th className="px-4 py-3">Prazo legal</th>
                  <th className="px-4 py-3">Externo</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {tipos.map((t) => (
                  <tr key={t.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="px-4 py-3 font-mono text-body-sm text-primary">{t.codigo}</td>
                    <td className="px-4 py-3 text-body-md text-on-surface">{t.nome}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {t.niveis_permitidos.map((n) => (
                          <Badge key={n} tone="neutral">{n}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-body-sm">{t.prazo_legal_dias ?? "—"}</td>
                    <td className="px-4 py-3">
                      {t.publico_externo ? <Badge tone="success">Sim</Badge> : <Badge tone="neutral">Não</Badge>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => abrirEdicao(t)}
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
        title={editando ? "Editar tipo de processo" : "Novo tipo de processo"}
        fields={fields}
        initialValues={valoresIniciais()}
        submitting={salvando}
        onSubmit={salvar}
        onCancel={() => setModalAberto(false)}
      />

      <ConfirmModal
        open={Boolean(removendo)}
        title="Desativar tipo de processo"
        message={`Deseja desativar "${removendo?.nome}"? Processos já iniciados com este tipo não são afetados.`}
        danger
        loading={salvando}
        onConfirm={remover}
        onCancel={() => setRemovendo(null)}
      />
    </div>
  );
}
