"use client";

/**
 * Central de documentos da demanda (§29–§31).
 *
 * A árvore é por pasta e o documento nunca é substituído: reenviar cria a
 * versão seguinte do mesmo grupo, e a anterior continua consultável com autor,
 * data e hash. É o que permite responder "qual ofício foi assinado?" sem
 * perder o que foi discutido antes.
 */

import { useCallback, useEffect, useState } from "react";
import { Download, FileText, History, Plus, Trash2, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { notify } from "@/components/ui/Toast";
import { cn, formatDate } from "@/lib/utils";
import type { ArvoreDocumentosDemanda, DocumentoDemanda } from "@/types/govtask";

const CATEGORIAS: Record<string, string> = {
  PROPOSTA: "Proposta",
  JURIDICO: "Jurídico",
  ENGENHARIA: "Engenharia",
  LICITACAO: "Licitação",
  CONTRATO: "Contrato",
  EXECUCAO: "Execução",
  MEDICOES: "Medições",
  FINANCEIRO: "Financeiro",
  PRESTACAO_CONTAS: "Prestação de Contas",
  FOTOS: "Fotos",
  DOCUMENTOS_EXTERNOS: "Documentos Externos",
  OUTROS: "Outros",
};

const CLASSIFICACOES: Record<string, string> = {
  PUBLICO: "Público",
  INTERNO: "Interno",
  RESTRITO: "Restrito",
  SIGILOSO: "Sigiloso",
};

const FORM_VAZIO = { pasta: "", descricao: "", categoria: "OUTROS", classificacao: "INTERNO" };

export function DocumentosDemandaTab({ demandaId, podeEditar }: { demandaId: string; podeEditar: boolean }) {
  const [arvore, setArvore] = useState<ArvoreDocumentosDemanda>();
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState({ ...FORM_VAZIO });
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [versaoDeGrupo, setVersaoDeGrupo] = useState<string | null>(null);
  const [versoes, setVersoes] = useState<Record<string, DocumentoDemanda[]>>({});

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setArvore(await api.arvoreDocumentosDemanda(demandaId));
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível carregar os documentos");
    } finally {
      setCarregando(false);
    }
  }, [demandaId]);

  useEffect(() => { carregar(); }, [carregar]);

  const enviar = async (substituirGrupoId?: string) => {
    if (!arquivo) return notify.error("Selecione o arquivo");
    setEnviando(true);
    try {
      await api.uploadDocumentoDemanda(demandaId, arquivo, {
        pasta: form.pasta || undefined,
        descricao: form.descricao || undefined,
        categoria: form.categoria,
        classificacao: form.classificacao,
        motivo_versao: substituirGrupoId ? form.descricao || "Nova versão" : undefined,
        substituir_grupo_id: substituirGrupoId,
      });
      setArquivo(null);
      setForm({ ...FORM_VAZIO });
      setMostrarForm(false);
      setVersaoDeGrupo(null);
      await carregar();
      notify.success(substituirGrupoId ? "Nova versão enviada" : "Documento enviado");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível enviar o documento");
    } finally {
      setEnviando(false);
    }
  };

  const baixar = async (doc: DocumentoDemanda) => {
    try {
      const { blob, nome } = await api.baixarDocumentoDemanda(demandaId, doc.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = nome || doc.nome_arquivo;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível baixar o documento");
    }
  };

  const remover = async (doc: DocumentoDemanda) => {
    const motivo = window.prompt("Motivo da remoção (fica na auditoria)");
    if (!motivo || motivo.trim().length < 5) return notify.error("Informe o motivo (mínimo 5 caracteres)");
    try {
      await api.removerDocumentoDemanda(demandaId, doc.id, motivo.trim());
      await carregar();
      notify.success("Documento removido");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível remover o documento");
    }
  };

  const verVersoes = async (doc: DocumentoDemanda) => {
    const grupo = doc.documento_grupo_id;
    if (!grupo) return notify.error("Este documento não tem histórico de versões");
    if (versoes[grupo]) {
      setVersoes((atual) => {
        const proximo = { ...atual };
        delete proximo[grupo];
        return proximo;
      });
      return;
    }
    try {
      const lista = await api.versoesDocumentoDemanda(demandaId, grupo);
      setVersoes((atual) => ({ ...atual, [grupo]: lista }));
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível carregar as versões");
    }
  };

  if (carregando) return <div className="h-40 animate-pulse rounded-xl bg-slate-200" />;

  const total = arvore?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">{total} documento(s) na árvore desta demanda.</p>
        {podeEditar && (
          <button
            onClick={() => { setVersaoDeGrupo(null); setMostrarForm((v) => !v); }}
            className="inline-flex items-center gap-1 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />Enviar documento
          </button>
        )}
      </div>

      {mostrarForm && podeEditar && (
        <section className="rounded-xl border border-blue-200 bg-blue-50/50 p-5">
          {versaoDeGrupo && (
            <p className="mb-3 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-blue-800">
              Enviando uma nova versão — o arquivo anterior permanece no histórico.
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <input type="file" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} aria-label="Arquivo" className="text-sm" />
            <input list="pastas-sugeridas" value={form.pasta} onChange={(e) => setForm({ ...form, pasta: e.target.value })} placeholder="Pasta (ex.: 02 Ofícios)" className="h-9 rounded-lg border border-slate-300 px-3 text-sm" />
            <datalist id="pastas-sugeridas">
              {(arvore?.pastas_sugeridas ?? []).map((p) => <option key={p} value={p} />)}
            </datalist>
            <select value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} aria-label="Categoria" className="h-9 rounded-lg border border-slate-300 px-3 text-sm">
              {Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={form.classificacao} onChange={(e) => setForm({ ...form, classificacao: e.target.value })} aria-label="Classificação" className="h-9 rounded-lg border border-slate-300 px-3 text-sm">
              {Object.entries(CLASSIFICACOES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Descrição" className="h-9 rounded-lg border border-slate-300 px-3 text-sm sm:col-span-2" />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setMostrarForm(false)} className="rounded-lg px-3 py-2 text-sm">Cancelar</button>
            <button onClick={() => enviar(versaoDeGrupo ?? undefined)} disabled={enviando || !arquivo} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {enviando ? "Enviando…" : "Enviar"}
            </button>
          </div>
        </section>
      )}

      {!total && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">Nenhum documento anexado a esta demanda.</p>}

      {(arvore?.pastas ?? []).map((no) => (
        <section key={no.pasta} className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <FileText className="h-4 w-4 text-slate-400" />
            {no.pasta}
            <span className="text-xs font-normal text-slate-500">({no.quantidade})</span>
          </h3>
          <ul className="mt-3 space-y-2">
            {no.documentos.map((doc) => {
              const grupo = doc.documento_grupo_id ?? doc.id;
              const abertas = versoes[grupo];
              return (
                <li key={doc.id} className="rounded-lg border border-slate-100 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {doc.nome_arquivo}
                        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-600">v{doc.versao}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {doc.enviado_por?.name || "Sistema"} · {formatDate(doc.created_at)}
                        {doc.descricao ? ` · ${doc.descricao}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button onClick={() => baixar(doc)} aria-label={`Baixar ${doc.nome_arquivo}`} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-700"><Download className="h-4 w-4" /></button>
                      <button onClick={() => verVersoes(doc)} aria-label="Ver versões" className={cn("rounded p-1.5 hover:bg-slate-100", abertas ? "text-blue-700" : "text-slate-500")}><History className="h-4 w-4" /></button>
                      {podeEditar && (
                        <button
                          onClick={() => {
                            setVersaoDeGrupo(doc.documento_grupo_id ?? doc.id);
                            setForm({ ...FORM_VAZIO, pasta: doc.pasta ?? "" });
                            setMostrarForm(true);
                          }}
                          aria-label={`Enviar nova versão de ${doc.nome_arquivo}`}
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-700"
                        >
                          <Upload className="h-4 w-4" />
                        </button>
                      )}
                      {podeEditar && (
                        <button onClick={() => remover(doc)} aria-label={`Remover ${doc.nome_arquivo}`} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                      )}
                    </div>
                  </div>

                  {abertas && (
                    <ol className="mt-3 space-y-1 border-l-2 border-slate-100 pl-3 text-xs">
                      {abertas.map((v) => (
                        <li key={v.id} className="flex items-center justify-between gap-2 text-slate-600">
                          <span>
                            <strong>v{v.versao}</strong> · {v.enviado_por?.name || "Sistema"} · {formatDate(v.created_at)}
                            {v.motivo_versao ? ` · ${v.motivo_versao}` : ""}
                            {v.hash_sha256 ? <span className="ml-1 text-slate-400">{v.hash_sha256.slice(0, 10)}…</span> : null}
                          </span>
                          <button onClick={() => baixar(v)} className="text-blue-700 hover:underline">baixar</button>
                        </li>
                      ))}
                    </ol>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
