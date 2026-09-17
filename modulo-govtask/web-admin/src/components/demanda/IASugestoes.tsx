"use client";

/**
 * Sugestões da camada de IA (§92).
 *
 * A sugestão não altera nada. Aplicar é uma edição normal da demanda, feita
 * pelo usuário — o texto fica registrado como dele, e a IA permanece como
 * rascunho descartável.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { ClipboardCopy, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { notify } from "@/components/ui/Toast";

type Campo = "resumo_executivo" | "proxima_acao";

export function IASugestoes({ demandaId, podeEditar, onAplicar }: {
  demandaId: string;
  podeEditar: boolean;
  onAplicar: (campo: Campo, valor: string) => void;
}) {
  const [disponivel, setDisponivel] = useState(false);
  const [provedor, setProvedor] = useState("");
  const [sugestao, setSugestao] = useState<{ campo: Campo; texto: string } | null>(null);
  const [carregando, setCarregando] = useState<string | null>(null);
  const [oficio, setOficio] = useState<string | null>(null);
  const [semelhantes, setSemelhantes] = useState<
    { id: string; numero: string; titulo: string; motivo: string }[] | null
  >(null);

  useEffect(() => {
    api.iaStatus(demandaId)
      .then((s) => { setDisponivel(s.disponivel); setProvedor(s.provedor); })
      .catch(() => setDisponivel(false));
  }, [demandaId]);

  const pedir = async (campo: Campo) => {
    setCarregando(campo);
    try {
      const r = campo === "resumo_executivo" ? await api.iaResumo(demandaId) : await api.iaProximaAcao(demandaId);
      setSugestao({ campo, texto: r.sugestao });
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível gerar a sugestão");
    } finally {
      setCarregando(null);
    }
  };

  const aplicar = () => {
    if (!sugestao) return;
    onAplicar(sugestao.campo, sugestao.texto);
    setSugestao(null);
  };

  const gerarOficio = async () => {
    setCarregando("oficio");
    try {
      const r = await api.iaGerarOficio(demandaId);
      setOficio(r.sugestao);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível gerar o ofício");
    } finally {
      setCarregando(null);
    }
  };

  const buscarSemelhantes = async () => {
    setCarregando("semelhantes");
    try {
      const r = await api.iaSemelhantes(demandaId);
      setSemelhantes(r.items);
      if (r.items.length === 0) notify.info("Nenhuma demanda parecida encontrada.");
      else if (!r.ranqueada_por_ia) notify.info("Resultado por correspondência textual.");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível buscar semelhantes");
    } finally {
      setCarregando(null);
    }
  };

  return (
    <section className="mt-6 rounded-xl border border-violet-200 bg-violet-50 p-5">
      <header className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-700" />
        <h2 className="font-bold text-violet-950">Sugestões de IA</h2>
        {provedor && <span className="text-xs text-violet-700">· {provedor}</span>}
      </header>
      <p className="mt-1 text-xs text-violet-800">
        A sugestão não altera a demanda até você aplicá-la. O texto aplicado passa a ser seu.
        {!disponivel && " A geração por IA está desligada neste ambiente; a busca de semelhantes segue disponível por texto."}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {disponivel && (
          <>
            <button onClick={() => pedir("resumo_executivo")} disabled={!!carregando} className="rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              {carregando === "resumo_executivo" ? "Gerando…" : "Sugerir resumo"}
            </button>
            <button onClick={() => pedir("proxima_acao")} disabled={!!carregando} className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-violet-800 ring-1 ring-violet-200 disabled:opacity-50">
              {carregando === "proxima_acao" ? "Gerando…" : "Sugerir próxima ação"}
            </button>
            <button onClick={gerarOficio} disabled={!!carregando} className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-violet-800 ring-1 ring-violet-200 disabled:opacity-50">
              {carregando === "oficio" ? "Gerando…" : "Gerar ofício"}
            </button>
          </>
        )}
        <button onClick={buscarSemelhantes} disabled={!!carregando} className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-violet-800 ring-1 ring-violet-200 disabled:opacity-50">
          {carregando === "semelhantes" ? "Buscando…" : "Demandas semelhantes"}
        </button>
      </div>

      {sugestao && (
        <div className="mt-3 rounded-lg bg-white p-3">
          <p className="text-sm text-slate-800">{sugestao.texto}</p>
          {podeEditar ? (
            <div className="mt-2 flex gap-2">
              <button onClick={aplicar} className="rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white">Aplicar sugestão</button>
              <button onClick={() => setSugestao(null)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">Descartar</button>
            </div>
          ) : (
            <p className="mt-1 text-xs text-slate-500">Você não tem permissão para aplicar a sugestão.</p>
          )}
        </div>
      )}

      {oficio && (
        <div className="mt-3 rounded-lg bg-white p-3">
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-sans text-sm text-slate-800">{oficio}</pre>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => { void navigator.clipboard.writeText(oficio); notify.success("Ofício copiado"); }}
              className="inline-flex items-center gap-1 rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white"
            >
              <ClipboardCopy className="h-3.5 w-3.5" /> Copiar
            </button>
            <button onClick={() => setOficio(null)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">Descartar</button>
          </div>
          <p className="mt-2 text-xs text-slate-400">Rascunho para revisão. Nada foi protocolado nem assinado.</p>
        </div>
      )}

      {semelhantes && (
        <div className="mt-3 space-y-1.5">
          {semelhantes.map((s) => (
            <Link key={s.id} href={`/demandas/${s.id}`} className="block rounded-lg bg-white p-2.5 text-sm hover:bg-violet-100">
              <span className="font-mono text-xs text-slate-500">{s.numero}</span>
              <p className="font-medium text-slate-800">{s.titulo}</p>
              {s.motivo && <p className="text-xs text-slate-500">{s.motivo}</p>}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
