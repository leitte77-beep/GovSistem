"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Building2, Clock, LifeBuoy, Loader2, MessageSquareReply, Phone, Send, User } from "lucide-react";
import { api } from "@/lib/api";
import type { Chamado, StatusChamado } from "@/lib/portalPosto";
import { quando, SeloStatus, STATUS, TIPOS } from "@/components/suporte/meta";

const FILTROS: { v: string; l: string }[] = [
  { v: "PENDENTES", l: "Pendentes" },
  { v: "RESOLVIDO", l: "Resolvidos" },
  { v: "", l: "Todos" },
];

/** Chamados que os postos abrem pelo portal do fornecedor. */
export default function SuporteAdmin() {
  const [lista, setLista] = useState<Chamado[] | null>(null);
  const [filtro, setFiltro] = useState("PENDENTES");
  const [selId, setSelId] = useState<string | null>(null);

  const carregar = useCallback(() => {
    api.chamadosSuporte().then(setLista).catch((e) => { setLista([]); toast.error((e as Error).message); });
  }, []);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) setSelId(id);
    carregar();
  }, [carregar]);

  const visiveis = useMemo(() => {
    if (!lista) return [];
    if (filtro === "PENDENTES") return lista.filter((c) => c.status !== "RESOLVIDO");
    return filtro ? lista.filter((c) => c.status === filtro) : lista;
  }, [lista, filtro]);

  const sel = lista?.find((c) => c.id === selId) ?? null;
  const pendentes = lista?.filter((c) => c.status !== "RESOLVIDO").length ?? 0;

  const atualizado = (c: Chamado) => setLista((l) => (l ? l.map((x) => (x.id === c.id ? c : x)) : l));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h1 text-text-title">Suporte dos postos</h1>
        <p className="text-body-sm text-text-subtle">Problemas, pedidos de correção, dúvidas e sugestões enviados pelo portal do fornecedor.</p>
      </div>

      <div className="inline-flex rounded-xl bg-[#EEF2F7] p-1">
        {FILTROS.map((f) => (
          <button key={f.v} onClick={() => setFiltro(f.v)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-body-sm transition ${filtro === f.v ? "bg-white font-semibold text-text-title shadow-sm" : "text-text-subtle hover:text-text-title"}`}>
            {f.l}
            {f.v === "PENDENTES" && pendentes > 0 && <span className="rounded-full bg-[#D92D20] px-1.5 text-[10px] font-bold leading-4 text-white">{pendentes}</span>}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <section className="overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card">
          {lista === null ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-[#F1F4FA]" />)}</div>
          ) : visiveis.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
              <LifeBuoy className="h-9 w-9 text-text-subtle" />
              <p className="text-body-sm text-text-subtle">{filtro === "PENDENTES" ? "Nenhum chamado pendente." : "Nenhum chamado."}</p>
            </div>
          ) : (
            <ul className="max-h-[70vh] overflow-y-auto">
              {visiveis.map((c) => {
                const m = TIPOS[c.tipo] ?? TIPOS.DUVIDA;
                return (
                  <li key={c.id}>
                    <button onClick={() => setSelId(c.id)}
                      className={`flex w-full items-start gap-3 border-b border-surface-border px-4 py-3 text-left transition last:border-0 ${selId === c.id ? "bg-[#EFF4FF]" : "hover:bg-[#F8FAFF]"}`}>
                      <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${m.claro}`}><m.icone size={16} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body-sm font-semibold text-text-title">{c.assunto}</span>
                        <span className="block truncate text-meta text-text-subtle">{c.posto ?? "Posto"} · {m.rotulo}</span>
                        <span className="block text-[11px] text-text-subtle"><span className="font-mono">{c.protocolo}</span> · {quando(c.created_at)}</span>
                      </span>
                      <SeloStatus status={c.status} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {sel ? <Detalhe key={sel.id} c={sel} onSalvo={atualizado} /> : (
          <section className="hidden items-center justify-center rounded-2xl border border-dashed border-surface-border bg-white p-10 text-body-sm text-text-subtle lg:flex">
            Selecione um chamado para ver e responder.
          </section>
        )}
      </div>
    </div>
  );
}

function Detalhe({ c, onSalvo }: { c: Chamado; onSalvo: (c: Chamado) => void }) {
  const [status, setStatus] = useState<StatusChamado>(c.status === "ABERTO" ? "EM_ANDAMENTO" : c.status);
  const [resposta, setResposta] = useState(c.resposta ?? "");
  const [salvando, setSalvando] = useState(false);
  const m = TIPOS[c.tipo] ?? TIPOS.DUVIDA;

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSalvando(true);
    try {
      const r = await api.responderChamado(c.id, { status, resposta: resposta.trim() || undefined });
      onSalvo(r);
      toast.success("Chamado atualizado. O posto já vê a resposta no portal.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-surface-border bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-meta text-text-subtle">{c.protocolo}</p>
          <h2 className="text-lg font-semibold text-text-title">{c.assunto}</h2>
          <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${m.claro}`}><m.icone size={12} /> {m.rotulo}</span>
        </div>
        <SeloStatus status={c.status} />
      </div>

      <dl className="grid gap-2 text-body-sm sm:grid-cols-2">
        <div className="flex items-center gap-2 text-text-body"><Building2 size={15} className="text-text-subtle" />{c.posto ?? "—"}</div>
        <div className="flex items-center gap-2 text-text-body"><User size={15} className="text-text-subtle" />{c.aberto_por}</div>
        {c.contato && <div className="flex items-center gap-2 text-text-body"><Phone size={15} className="text-text-subtle" />{c.contato}</div>}
        <div className="flex items-center gap-2 text-text-body"><Clock size={15} className="text-text-subtle" />{quando(c.created_at)}</div>
        {c.abastecimento_id && (
          <div className="sm:col-span-2">
            <Link href={`/abastecimentos/${c.abastecimento_id}`} className="font-mono text-[#1D4ED8] hover:underline">
              Abastecimento {c.abastecimento_numero ?? ""} →
            </Link>
          </div>
        )}
      </dl>

      <div className="rounded-xl bg-[#F8FAFC] p-4">
        <p className="whitespace-pre-wrap text-body-sm text-text-body">{c.descricao}</p>
      </div>

      <form onSubmit={salvar} className="space-y-3 border-t border-surface-border pt-4">
        <label className="block text-body-sm font-medium text-text-title">
          <span className="inline-flex items-center gap-1.5"><MessageSquareReply size={15} /> Resposta ao posto</span>
          <textarea className="input mt-1.5 min-h-[120px]" maxLength={5000} value={resposta} onChange={(e) => setResposta(e.target.value)}
            placeholder="O que foi feito, ou o que o posto precisa fazer." />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-xl bg-[#EEF2F7] p-1">
            {(Object.keys(STATUS) as StatusChamado[]).map((s) => (
              <button type="button" key={s} onClick={() => setStatus(s)}
                className={`rounded-lg px-3 py-1.5 text-body-sm transition ${status === s ? "bg-white font-semibold text-text-title shadow-sm" : "text-text-subtle hover:text-text-title"}`}>
                {STATUS[s].rotulo}
              </button>
            ))}
          </div>
          <button type="submit" className="btn btn-primary" disabled={salvando}>
            {salvando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Salvar
          </button>
        </div>
        {c.respondido_em && <p className="text-meta text-text-subtle">Última resposta por {c.respondido_por} em {quando(c.respondido_em)}.</p>}
      </form>
    </section>
  );
}
