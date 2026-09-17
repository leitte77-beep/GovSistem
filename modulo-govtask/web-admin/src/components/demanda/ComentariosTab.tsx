"use client";

/**
 * Conversa interna da demanda (§42, §43).
 *
 * Comunicação, não auditoria: o comentário é editável por quem o escreveu, e a
 * tela deixa isso explícito ("editado"), com o texto anterior consultável. Os
 * fatos oficiais continuam na aba Histórico.
 */

import { useCallback, useEffect, useState } from "react";
import { History, Pin, Send, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { notify } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/utils";
import type { ComentarioDemanda } from "@/types/govtask";

export function ComentariosTab({ demandaId, usuarioId, podeFixar }: {
  demandaId: string; usuarioId?: string; podeFixar: boolean;
}) {
  const [comentarios, setComentarios] = useState<ComentarioDemanda[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [respondendo, setRespondendo] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState("");
  const [revisoes, setRevisoes] = useState<Record<string, { texto_anterior: string; created_at: string }[]>>({});

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setComentarios(await api.listarComentarios(demandaId));
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível carregar a conversa");
    } finally {
      setCarregando(false);
    }
  }, [demandaId]);

  useEffect(() => { carregar(); }, [carregar]);

  const enviar = async () => {
    if (!texto.trim()) return;
    setEnviando(true);
    try {
      await api.comentar(demandaId, {
        texto: texto.trim(),
        responde_a_id: respondendo ?? undefined,
      });
      setTexto("");
      setRespondendo(null);
      await carregar();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível comentar");
    } finally {
      setEnviando(false);
    }
  };

  const salvarEdicao = async (id: string) => {
    if (!rascunho.trim()) return;
    try {
      await api.editarComentario(demandaId, id, rascunho.trim());
      setEditando(null);
      await carregar();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível editar");
    }
  };

  const verRevisoes = async (id: string) => {
    if (revisoes[id]) return setRevisoes({ ...revisoes, [id]: [] });
    try {
      setRevisoes({ ...revisoes, [id]: await api.revisoesComentario(demandaId, id) });
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível abrir o histórico");
    }
  };

  const alternarFixado = async (id: string, fixado: boolean) => {
    try {
      await api.fixarComentario(demandaId, id, !fixado);
      await carregar();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível fixar");
    }
  };

  const excluir = async (id: string) => {
    try {
      await api.excluirComentario(demandaId, id);
      await carregar();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível excluir");
    }
  };

  if (carregando) return <div className="h-40 animate-pulse rounded-xl bg-slate-200" />;

  const porId = new Map(comentarios.map((c) => [c.id, c]));

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        {respondendo && (
          <p className="mb-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Respondendo a: “{porId.get(respondendo)?.texto.slice(0, 80)}…”{" "}
            <button onClick={() => setRespondendo(null)} className="font-semibold text-blue-700">cancelar</button>
          </p>
        )}
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          placeholder="Escreva um comentário. Use @email para avisar alguém."
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800"
        />
        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            A @menção avisa a pessoa; só casa com usuário ativo do município.
          </p>
          <button
            onClick={enviar}
            disabled={enviando || !texto.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Send className="h-4 w-4" />{enviando ? "Enviando…" : "Comentar"}
          </button>
        </div>
      </div>

      {!comentarios.length && (
        <p className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
          Nenhum comentário ainda. Comece a conversa sobre esta demanda.
        </p>
      )}

      {comentarios.map((c) => {
        const meu = c.autor_id === usuarioId;
        const pai = c.responde_a_id ? porId.get(c.responde_a_id) : undefined;
        return (
          <article
            key={c.id}
            className={`rounded-xl border bg-white p-5 ${c.fixado ? "border-amber-300 bg-amber-50/40" : "border-slate-200"}`}
          >
            <header className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold text-slate-800">{c.autor_nome || "Usuário"}</span>
                <span className="text-xs text-slate-500">{formatDateTime(c.created_at)}</span>
                {c.editado_em && (
                  <button onClick={() => verRevisoes(c.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-blue-700">
                    <History className="h-3 w-3" />editado
                  </button>
                )}
                {c.fixado && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">FIXADO</span>}
              </div>
              <div className="flex items-center gap-2">
                {podeFixar && (
                  <button onClick={() => alternarFixado(c.id, c.fixado)} title={c.fixado ? "Desafixar" : "Fixar no topo"} className="text-slate-400 hover:text-amber-700">
                    <Pin className="h-4 w-4" />
                  </button>
                )}
                {meu && (
                  <button onClick={() => excluir(c.id)} title="Excluir" className="text-slate-400 hover:text-red-700">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </header>

            {pai && (
              <p className="mt-2 border-l-2 border-slate-300 pl-3 text-xs italic text-slate-500">
                {pai.autor_nome}: “{pai.texto.slice(0, 120)}”
              </p>
            )}

            {editando === c.id ? (
              <div className="mt-3">
                <textarea value={rascunho} onChange={(e) => setRascunho(e.target.value)} rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <div className="mt-2 flex justify-end gap-2">
                  <button onClick={() => setEditando(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">Cancelar</button>
                  <button onClick={() => salvarEdicao(c.id)} className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white">Salvar</button>
                </div>
              </div>
            ) : (
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{c.texto}</p>
            )}

            {(revisoes[c.id]?.length ?? 0) > 0 && (
              <ol className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3">
                {revisoes[c.id].map((r, i) => (
                  <li key={i} className="text-xs text-slate-600">
                    <span className="font-semibold">{formatDateTime(r.created_at)}:</span> {r.texto_anterior}
                  </li>
                ))}
              </ol>
            )}

            <footer className="mt-3 flex gap-3 text-xs font-semibold text-slate-500">
              <button onClick={() => setRespondendo(c.id)} className="hover:text-blue-700">Responder</button>
              {meu && editando !== c.id && (
                <button onClick={() => { setEditando(c.id); setRascunho(c.texto); }} className="hover:text-blue-700">Editar</button>
              )}
              {c.mencoes.length > 0 && <span>{c.mencoes.length} pessoa(s) avisada(s)</span>}
            </footer>
          </article>
        );
      })}
    </section>
  );
}
