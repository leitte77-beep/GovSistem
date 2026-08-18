"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import type { TextoPadrao } from "@/types/govpro";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import ConfirmModal from "@/components/ConfirmModal";
import type { RichTextEditorHandle } from "@/components/RichTextEditor";

const RichTextEditor = dynamic(() => import("@/components/RichTextEditor"), { ssr: false });

export default function TextosPadraoPage() {
  const [textos, setTextos] = useState<TextoPadrao[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<TextoPadrao | null>(null);
  const [removendo, setRemovendo] = useState<TextoPadrao | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [nome, setNome] = useState("");
  const [conteudo, setConteudo] = useState("");
  const editorRef = useRef<RichTextEditorHandle>(null);

  const carregar = () =>
    api
      .listTextosPadrao()
      .then(setTextos)
      .catch(() => toast.error("Falha ao carregar textos padrão"))
      .finally(() => setLoading(false));

  useEffect(() => {
    carregar();
  }, []);

  const abrirNovo = () => {
    setEditando(null);
    setNome("");
    setConteudo("");
    setModalAberto(true);
  };

  const abrirEdicao = (t: TextoPadrao) => {
    setEditando(t);
    setNome(t.nome);
    setConteudo(t.conteudo ?? "");
    setModalAberto(true);
  };

  const salvar = async () => {
    if (nome.trim().length < 2) {
      toast.error("Informe um nome válido");
      return;
    }
    setSalvando(true);
    try {
      const payload = { nome: nome.trim(), conteudo: conteudo || null };
      if (editando) {
        await api.atualizarTextoPadrao(editando.id, payload);
        toast.success("Texto padrão atualizado");
      } else {
        await api.criarTextoPadrao(payload);
        toast.success("Texto padrão criado");
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
      await api.removerTextoPadrao(removendo.id);
      toast.success("Texto padrão desativado");
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
        title="Textos padrão"
        subtitle="Trechos reutilizáveis (fechos, cláusulas, cabeçalhos) com variáveis, inseridos no editor durante a produção do documento."
        actions={
          <button
            onClick={abrirNovo}
            className="inline-flex items-center gap-2 h-11 px-4 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">add_circle</span>
            Novo texto padrão
          </button>
        }
      />

      <div className="px-gutter max-w-container-max mx-auto">
        {loading ? (
          <div className="text-center py-16 text-on-surface-variant">Carregando…</div>
        ) : textos.length === 0 ? (
          <EmptyState icon="text_snippet" title="Nenhum texto padrão cadastrado" />
        ) : (
          <div className="bg-surface-container-lowest rounded-lg border border-outline-variant overflow-hidden overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-surface-container-high">
                <tr className="text-label-md font-label-md text-on-surface-variant">
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Prévia</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {textos.map((t) => (
                  <tr key={t.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="px-4 py-3 text-body-md text-on-surface">{t.nome}</td>
                    <td className="px-4 py-3 text-body-sm text-on-surface-variant max-w-md truncate">
                      {t.conteudo?.replace(/<[^>]*>/g, "").slice(0, 80) || "—"}
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

      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-gutter" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setModalAberto(false)} />
          <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-surface-container-lowest rounded-lg shadow-xl p-6">
            <h3 className="text-headline-sm font-headline-sm text-on-surface mb-5">
              {editando ? "Editar texto padrão" : "Novo texto padrão"}
            </h3>
            <div className="space-y-2 mb-5">
              <label className="text-label-md font-label-md text-on-surface">Nome *</label>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full h-11 px-3 bg-surface-container-low border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="space-y-2 mb-2">
              <label className="text-label-md font-label-md text-on-surface">Conteúdo</label>
              <RichTextEditor ref={editorRef} value={conteudo} onChange={setConteudo} minHeight={180} />
              <p className="text-body-sm text-on-surface-variant">
                Variáveis como {"{{processo.nup}}"} e {"{{interessado.nome}}"} são preenchidas ao inserir em um processo.
              </p>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setModalAberto(false)}
                disabled={salvando}
                className="h-10 px-4 text-label-md font-label-md border border-outline text-on-surface rounded-lg hover:bg-surface-container-high transition-colors disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={salvar}
                disabled={salvando}
                aria-busy={salvando}
                className="h-10 px-4 text-label-md font-label-md rounded-lg bg-primary text-on-primary hover:bg-primary-container transition-colors disabled:opacity-60"
              >
                {salvando ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(removendo)}
        title="Desativar texto padrão"
        message={`Deseja desativar "${removendo?.nome}"?`}
        danger
        loading={salvando}
        onConfirm={remover}
        onCancel={() => setRemovendo(null)}
      />
    </div>
  );
}
