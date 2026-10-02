"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { ChevronDown, Clock, LifeBuoy, Loader2, MessageSquareReply, Plus, Send, X } from "lucide-react";
import { Chamado, portal, TipoChamado } from "@/lib/portalPosto";
import { quando, SeloStatus, TIPOS } from "@/components/suporte/meta";

/** Suporte do posto: abrir chamado (problema, correção, dúvida, sugestão) e acompanhar a resposta. */
export default function SuportePosto() {
  const [lista, setLista] = useState<Chamado[] | null>(null);
  const [novo, setNovo] = useState(false);
  const [abertoId, setAbertoId] = useState<string | null>(null);

  const carregar = useCallback(() => {
    portal.suporte().then(setLista).catch((e) => { setLista([]); toast.error((e as Error).message); });
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const emAberto = lista?.filter((c) => c.status !== "RESOLVIDO").length ?? 0;

  return (
    <div className="space-y-6">
      <div className="pp-sobe flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[32px] font-bold leading-tight tracking-tight text-text-title">Suporte</h1>
          <p className="text-body-sm text-text-subtle">Avise sobre problemas, peça correções ou tire dúvidas. A equipe responde por aqui.</p>
        </div>
        {!novo && (
          <button className="btn btn-primary shadow-lg shadow-[#1D5BD6]/25" onClick={() => setNovo(true)}><Plus size={16} /> Novo chamado</button>
        )}
      </div>

      {novo ? (
        <NovoChamado onCancelar={() => setNovo(false)} onCriado={(c) => { setNovo(false); setAbertoId(c.id); carregar(); }} />
      ) : (
        <section className="pp-sobe pp-sobe-1 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(Object.keys(TIPOS) as TipoChamado[]).map((t) => {
            const m = TIPOS[t];
            return (
              <button key={t} type="button" onClick={() => setNovo(true)}
                className="pp-cartao group flex items-center gap-3 rounded-2xl border border-[#E3E8F2] bg-white p-4 text-left">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md ${m.cor}`}><m.icone size={19} /></span>
                <span className="min-w-0">
                  <span className="block font-semibold text-text-title">{m.rotulo}</span>
                  <span className="block text-meta text-text-subtle">{m.texto}</span>
                </span>
              </button>
            );
          })}
        </section>
      )}

      <section className="pp-sobe pp-sobe-2 overflow-hidden rounded-3xl border border-[#E3E8F2] bg-white">
        <div className="flex items-center justify-between border-b border-[#E3E8F2] px-6 py-4">
          <h2 className="text-base font-semibold text-text-title">Meus chamados</h2>
          {lista && lista.length > 0 && <span className="text-meta text-text-subtle">{emAberto} em aberto · {lista.length} no total</span>}
        </div>
        {lista === null ? (
          <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-[#F1F4FA]" />)}</div>
        ) : lista.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
            <span className="mb-1 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2DD4BF] to-[#0D9488] text-white shadow-lg shadow-[#0D9488]/30"><LifeBuoy className="h-8 w-8" /></span>
            <p className="font-medium text-text-title">Nenhum chamado ainda</p>
            <p className="max-w-sm text-body-sm text-text-subtle">Encontrou algo errado ou tem uma dúvida? Abra um chamado e acompanhe a resposta aqui.</p>
          </div>
        ) : (
          <ul>
            {lista.map((c) => {
              const m = TIPOS[c.tipo] ?? TIPOS.DUVIDA;
              const aberto = abertoId === c.id;
              return (
                <li key={c.id} className="border-b border-[#E3E8F2] last:border-0">
                  <button type="button" onClick={() => setAbertoId(aberto ? null : c.id)} aria-expanded={aberto}
                    className="flex w-full items-center gap-4 px-6 py-4 text-left transition hover:bg-[#F8FAFF]">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${m.claro}`}><m.icone size={18} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-semibold text-text-title">{c.assunto}</span>
                        {c.resposta && !aberto && <span className="inline-flex items-center gap-1 rounded-full bg-[#1D5BD6] px-2 py-0.5 text-[11px] font-semibold text-white"><MessageSquareReply size={11} /> Respondido</span>}
                      </span>
                      <span className="block text-meta text-text-subtle">
                        <span className="font-mono">{c.protocolo}</span> · {m.rotulo} · {quando(c.created_at)}
                        {c.abastecimento_numero && <> · <span className="font-mono">{c.abastecimento_numero}</span></>}
                      </span>
                    </span>
                    <SeloStatus status={c.status} />
                    <ChevronDown size={18} className={`shrink-0 text-text-subtle transition ${aberto ? "rotate-180" : ""}`} />
                  </button>
                  {aberto && (
                    <div className="space-y-3 bg-[#FAFBFE] px-6 pb-5 pt-1">
                      <div className="rounded-2xl border border-[#E3E8F2] bg-white p-4">
                        <p className="mb-1 text-meta font-medium text-text-subtle">{c.aberto_por} escreveu</p>
                        <p className="whitespace-pre-wrap text-body-sm text-text-body">{c.descricao}</p>
                        {c.contato && <p className="mt-2 text-meta text-text-subtle">Contato: {c.contato}</p>}
                      </div>
                      {c.resposta ? (
                        <div className="rounded-2xl border border-[#BFD3FF] bg-[#F1F6FF] p-4">
                          <p className="mb-1 inline-flex items-center gap-1.5 text-meta font-semibold text-[#1D4ED8]">
                            <MessageSquareReply size={14} /> Resposta da equipe{c.respondido_por ? ` · ${c.respondido_por}` : ""}{c.respondido_em ? ` · ${quando(c.respondido_em)}` : ""}
                          </p>
                          <p className="whitespace-pre-wrap text-body-sm text-text-body">{c.resposta}</p>
                        </div>
                      ) : (
                        <p className="inline-flex items-center gap-1.5 text-meta text-text-subtle"><Clock size={14} /> Aguardando resposta da equipe.</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function NovoChamado({ onCancelar, onCriado }: { onCancelar: () => void; onCriado: (c: Chamado) => void }) {
  const [tipo, setTipo] = useState<TipoChamado>("PROBLEMA");
  const [assunto, setAssunto] = useState("");
  const [descricao, setDescricao] = useState("");
  const [abastecimento, setAbastecimento] = useState("");
  const [contato, setContato] = useState("");
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try {
      const c = await portal.abrirChamado({
        tipo, assunto: assunto.trim(), descricao: descricao.trim(),
        abastecimento: abastecimento.trim() || undefined, contato: contato.trim() || undefined,
      });
      toast.success(`Chamado ${c.protocolo} aberto. Avisaremos por aqui.`);
      onCriado(c);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="pp-sobe pp-sobe-1 space-y-5 rounded-3xl border border-[#E3E8F2] bg-white p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-title">Novo chamado</h2>
          <p className="text-body-sm text-text-subtle">Quanto mais detalhes, mais rápido conseguimos resolver.</p>
        </div>
        <button type="button" onClick={onCancelar} aria-label="Fechar" className="rounded-lg p-1.5 text-text-subtle hover:bg-[#F3F4F6]"><X size={18} /></button>
      </div>

      <fieldset>
        <legend className="mb-2 text-body-sm font-medium text-text-title">Sobre o que é?</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.keys(TIPOS) as TipoChamado[]).map((t) => {
            const m = TIPOS[t];
            const sel = tipo === t;
            return (
              <label key={t} className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-3 transition ${sel ? "border-[#1D5BD6] bg-[#F1F6FF]" : "border-[#E3E8F2] hover:border-[#BFD3FF]"}`}>
                <input type="radio" name="tipo" value={t} checked={sel} onChange={() => setTipo(t)} className="sr-only" />
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white ${m.cor}`}><m.icone size={16} /></span>
                <span className="min-w-0">
                  <span className="block text-body-sm font-semibold text-text-title">{m.rotulo}</span>
                  <span className="block text-[11px] leading-tight text-text-subtle">{m.texto}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <label className="block text-body-sm font-medium text-text-title">Assunto
          <input className="input mt-1.5" required minLength={3} maxLength={150} value={assunto} onChange={(e) => setAssunto(e.target.value)}
            placeholder={tipo === "CORRECAO" ? "Ex.: litros errados no abastecimento" : "Resumo em poucas palavras"} />
        </label>
        <label className="block text-body-sm font-medium text-text-title">Nº do abastecimento <span className="font-normal text-text-subtle">(opcional)</span>
          <input className="input mt-1.5 font-mono" maxLength={30} value={abastecimento} onChange={(e) => setAbastecimento(e.target.value)} placeholder="AB-2026/000123" />
        </label>
      </div>

      <label className="block text-body-sm font-medium text-text-title">Descreva o que aconteceu
        <textarea className="input mt-1.5 min-h-[140px]" required minLength={10} maxLength={5000} value={descricao} onChange={(e) => setDescricao(e.target.value)}
          placeholder={tipo === "CORRECAO" ? "O que está errado e qual é o valor correto?" : "O que você estava fazendo, o que esperava e o que aconteceu."} />
        <span className="mt-1 block text-right text-[11px] font-normal text-text-subtle">{descricao.length}/5000</span>
      </label>

      <label className="block text-body-sm font-medium text-text-title">Telefone ou e-mail para contato <span className="font-normal text-text-subtle">(opcional)</span>
        <input className="input mt-1.5" maxLength={150} value={contato} onChange={(e) => setContato(e.target.value)} placeholder="(44) 99999-0000" />
      </label>

      <div className="flex flex-wrap justify-end gap-2 border-t border-[#E3E8F2] pt-4">
        <button type="button" className="btn btn-ghost" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="btn btn-primary shadow-lg shadow-[#1D5BD6]/25" disabled={enviando}>
          {enviando ? <><Loader2 size={16} className="animate-spin" /> Enviando…</> : <><Send size={16} /> Enviar chamado</>}
        </button>
      </div>
    </form>
  );
}
