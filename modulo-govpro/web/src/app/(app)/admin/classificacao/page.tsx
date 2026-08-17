"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import type { PlanoClassificacao, PlanoClassificacaoUpdate } from "@/types/govpro";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import ConfirmModal from "@/components/ConfirmModal";
import CatalogFormModal, { CatalogField, CatalogFormValues } from "@/components/admin/CatalogFormModal";

interface ClasseArvore extends PlanoClassificacao {
  profundidade: number;
}

function montarArvore(classes: PlanoClassificacao[]): ClasseArvore[] {
  const porPai = new Map<string, PlanoClassificacao[]>();
  for (const c of classes) {
    const chave = c.classe_pai_id ?? "__raiz__";
    if (!porPai.has(chave)) porPai.set(chave, []);
    porPai.get(chave)!.push(c);
  }
  const resultado: ClasseArvore[] = [];
  const visitar = (chave: string, profundidade: number) => {
    const filhos = (porPai.get(chave) ?? []).sort((a, b) => a.codigo.localeCompare(b.codigo));
    for (const filho of filhos) {
      resultado.push({ ...filho, profundidade });
      visitar(filho.id, profundidade + 1);
    }
  };
  visitar("__raiz__", 0);
  return resultado;
}

export default function ClassificacaoPage() {
  const [classes, setClasses] = useState<PlanoClassificacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<PlanoClassificacao | null>(null);
  const [removendo, setRemovendo] = useState<PlanoClassificacao | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = () =>
    api
      .listPlanoClassificacao()
      .then(setClasses)
      .catch(() => toast.error("Falha ao carregar plano de classificação"))
      .finally(() => setLoading(false));

  useEffect(() => {
    carregar();
  }, []);

  const arvore = useMemo(() => montarArvore(classes), [classes]);

  const fields: CatalogField[] = [
    { name: "codigo", label: "Código", type: "text", required: true, disabled: Boolean(editando), span: 1 },
    {
      name: "classe_pai_id",
      label: "Classe superior",
      type: "select",
      options: classes.filter((c) => c.id !== editando?.id).map((c) => ({ value: c.id, label: `${c.codigo} — ${c.descricao}` })),
      span: 1,
    },
    { name: "descricao", label: "Descrição", type: "text", required: true, span: 2 },
  ];

  const abrirNovo = () => {
    setEditando(null);
    setModalAberto(true);
  };

  const valoresIniciais = (): CatalogFormValues =>
    editando
      ? { codigo: editando.codigo, classe_pai_id: editando.classe_pai_id ?? "", descricao: editando.descricao }
      : { codigo: "", classe_pai_id: "", descricao: "" };

  const salvar = async (values: CatalogFormValues) => {
    setSalvando(true);
    try {
      const payload = {
        descricao: values.descricao as string,
        classe_pai_id: (values.classe_pai_id as string) || null,
      };
      if (editando) {
        await api.atualizarClasse(editando.id, payload as PlanoClassificacaoUpdate);
        toast.success("Classe atualizada");
      } else {
        await api.criarClasse({ codigo: values.codigo as string, ...payload });
        toast.success("Classe criada");
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
      await api.removerClasse(removendo.id);
      toast.success("Classe desativada");
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
        title="Plano de classificação"
        subtitle="Estrutura hierárquica de classes documentais (função → subfunção → série) — instrumento próprio do ente."
        actions={
          <button
            onClick={abrirNovo}
            className="inline-flex items-center gap-2 h-11 px-4 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">add_circle</span>
            Nova classe
          </button>
        }
      />

      <div className="px-gutter max-w-container-max mx-auto">
        {loading ? (
          <div className="text-center py-16 text-on-surface-variant">Carregando…</div>
        ) : arvore.length === 0 ? (
          <EmptyState icon="sort" title="Nenhuma classe cadastrada" />
        ) : (
          <div className="bg-surface-container-lowest rounded-lg border border-outline-variant overflow-hidden overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-surface-container-high">
                <tr className="text-label-md font-label-md text-on-surface-variant">
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {arvore.map((c) => (
                  <tr key={c.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="px-4 py-3 font-mono text-body-sm text-primary">{c.codigo}</td>
                    <td className="px-4 py-3 text-body-md text-on-surface">
                      <span style={{ paddingLeft: `${c.profundidade * 20}px` }} className="inline-flex items-center gap-2">
                        {c.profundidade > 0 && (
                          <span className="material-symbols-outlined text-[16px] text-outline-variant" aria-hidden="true">
                            subdirectory_arrow_right
                          </span>
                        )}
                        {c.descricao}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setEditando(c);
                            setModalAberto(true);
                          }}
                          aria-label={`Editar ${c.codigo}`}
                          className="w-9 h-9 flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors"
                        >
                          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">edit</span>
                        </button>
                        <button
                          onClick={() => setRemovendo(c)}
                          aria-label={`Desativar ${c.codigo}`}
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
        title={editando ? "Editar classe" : "Nova classe"}
        fields={fields}
        initialValues={valoresIniciais()}
        submitting={salvando}
        onSubmit={salvar}
        onCancel={() => setModalAberto(false)}
      />

      <ConfirmModal
        open={Boolean(removendo)}
        title="Desativar classe"
        message={`Deseja desativar "${removendo?.codigo} — ${removendo?.descricao}"?`}
        danger
        loading={salvando}
        onConfirm={remover}
        onCancel={() => setRemovendo(null)}
      />
    </div>
  );
}
