"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import type { Unidade, UnidadeUpdate } from "@/types/govpro";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import Badge from "@/components/Badge";
import ConfirmModal from "@/components/ConfirmModal";
import CatalogFormModal, { CatalogField, CatalogFormValues } from "@/components/admin/CatalogFormModal";

interface UnidadeArvore extends Unidade {
  profundidade: number;
}

function montarArvore(unidades: Unidade[]): UnidadeArvore[] {
  const porPai = new Map<string, Unidade[]>();
  for (const u of unidades) {
    const chave = u.unidade_pai_id ?? "__raiz__";
    if (!porPai.has(chave)) porPai.set(chave, []);
    porPai.get(chave)!.push(u);
  }
  const resultado: UnidadeArvore[] = [];
  const visitar = (chave: string, profundidade: number) => {
    const filhos = (porPai.get(chave) ?? []).sort((a, b) => a.nome.localeCompare(b.nome));
    for (const filho of filhos) {
      resultado.push({ ...filho, profundidade });
      visitar(filho.id, profundidade + 1);
    }
  };
  visitar("__raiz__", 0);
  return resultado;
}

export default function UnidadesPage() {
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Unidade | null>(null);
  const [removendo, setRemovendo] = useState<Unidade | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = () =>
    api
      .listUnidades()
      .then(setUnidades)
      .catch(() => toast.error("Falha ao carregar unidades"))
      .finally(() => setLoading(false));

  useEffect(() => {
    carregar();
  }, []);

  const arvore = useMemo(() => montarArvore(unidades), [unidades]);

  const fields: CatalogField[] = [
    { name: "sigla", label: "Sigla", type: "text", required: true, span: 1 },
    { name: "nome", label: "Nome", type: "text", required: true, span: 1 },
    {
      name: "unidade_pai_id",
      label: "Unidade superior",
      type: "select",
      options: unidades.filter((u) => u.id !== editando?.id).map((u) => ({ value: u.id, label: `${u.nome} (${u.sigla})` })),
      span: 2,
    },
    { name: "email", label: "E-mail", type: "text", span: 1 },
    { name: "codigo_protocolizadora", label: "Código de protocolo (5 dígitos)", type: "text", span: 1 },
    { name: "protocolizadora", label: "Unidade protocolizadora (autua processos, gera NUP)", type: "checkbox", span: 2 },
  ];

  const abrirNovo = () => {
    setEditando(null);
    setModalAberto(true);
  };

  const valoresIniciais = (): CatalogFormValues =>
    editando
      ? {
          sigla: editando.sigla,
          nome: editando.nome,
          unidade_pai_id: editando.unidade_pai_id ?? "",
          email: editando.email ?? "",
          codigo_protocolizadora: editando.codigo_protocolizadora ?? "",
          protocolizadora: editando.protocolizadora,
        }
      : { sigla: "", nome: "", unidade_pai_id: "", email: "", codigo_protocolizadora: "", protocolizadora: false };

  const salvar = async (values: CatalogFormValues) => {
    setSalvando(true);
    try {
      const payload = {
        nome: values.nome as string,
        unidade_pai_id: (values.unidade_pai_id as string) || null,
        email: (values.email as string) || null,
        codigo_protocolizadora: (values.codigo_protocolizadora as string) || null,
        protocolizadora: Boolean(values.protocolizadora),
      };
      if (editando) {
        await api.atualizarUnidade(editando.id, payload as UnidadeUpdate);
        toast.success("Unidade atualizada");
      } else {
        await api.criarUnidade({ sigla: values.sigla as string, ...payload });
        toast.success("Unidade criada");
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
      await api.removerUnidade(removendo.id);
      toast.success("Unidade desativada");
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
        title="Estrutura organizacional"
        subtitle="Unidades, setores e secretarias em árvore hierárquica."
        actions={
          <button
            onClick={abrirNovo}
            className="inline-flex items-center gap-2 h-11 px-4 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">add_circle</span>
            Nova unidade
          </button>
        }
      />

      <div className="px-gutter max-w-container-max mx-auto">
        {loading ? (
          <div className="text-center py-16 text-on-surface-variant">Carregando…</div>
        ) : arvore.length === 0 ? (
          <EmptyState icon="account_tree" title="Nenhuma unidade cadastrada" />
        ) : (
          <div className="bg-surface-container-lowest rounded-lg border border-outline-variant overflow-hidden overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-surface-container-high">
                <tr className="text-label-md font-label-md text-on-surface-variant">
                  <th className="px-4 py-3">Unidade</th>
                  <th className="px-4 py-3">Sigla</th>
                  <th className="px-4 py-3">Protocolizadora</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {arvore.map((u) => (
                  <tr key={u.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="px-4 py-3 text-body-md text-on-surface">
                      <span style={{ paddingLeft: `${u.profundidade * 20}px` }} className="inline-flex items-center gap-2">
                        {u.profundidade > 0 && (
                          <span className="material-symbols-outlined text-[16px] text-outline-variant" aria-hidden="true">
                            subdirectory_arrow_right
                          </span>
                        )}
                        {u.nome}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-body-sm text-primary">{u.sigla}</td>
                    <td className="px-4 py-3">
                      {u.protocolizadora ? (
                        <Badge tone="success">{u.codigo_protocolizadora ?? "Sim"}</Badge>
                      ) : (
                        <Badge tone="neutral">Não</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditando(u);
                            setModalAberto(true);
                          }}
                          aria-label={`Editar ${u.nome}`}
                          className="w-9 h-9 flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors"
                        >
                          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">edit</span>
                        </button>
                        <button
                          onClick={() => setRemovendo(u)}
                          aria-label={`Desativar ${u.nome}`}
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
        title={editando ? "Editar unidade" : "Nova unidade"}
        fields={fields}
        initialValues={valoresIniciais()}
        submitting={salvando}
        onSubmit={salvar}
        onCancel={() => setModalAberto(false)}
      />

      <ConfirmModal
        open={Boolean(removendo)}
        title="Desativar unidade"
        message={`Deseja desativar "${removendo?.nome}"? Processos já vinculados não são afetados.`}
        danger
        loading={salvando}
        onConfirm={remover}
        onCancel={() => setRemovendo(null)}
      />
    </div>
  );
}
