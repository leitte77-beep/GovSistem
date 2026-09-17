"use client";

/**
 * Acompanhamentos (§45, §46).
 *
 * Reúne o que o usuário decidiu seguir — não o que o sistema atribuiu a ele.
 * São duas filas diferentes: "acompanho" é interesse (receber atualizações),
 * "sob minha gestão" é responsabilidade. Misturá-las esconderia a diferença
 * entre uma demanda que só preciso saber e uma que preciso tocar.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCircle2, Eye, Star } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { DemandaV2 } from "@/types/govtask";

type Aba = "acompanho" | "gestao";

export default function AcompanhamentosPage() {
  const [aba, setAba] = useState<Aba>("acompanho");
  const [itens, setItens] = useState<DemandaV2[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const pagina = await api.listDemandasV2(
        aba === "acompanho" ? { seguindo: true, encerradas: false } : { minhas: true, encerradas: false }
      );
      setItens(pagina.items);
    } catch {
      setItens([]);
    } finally {
      setCarregando(false);
    }
  }, [aba]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const abas: [Aba, string][] = [
    ["acompanho", "Que eu acompanho"],
    ["gestao", "Sob minha gestão"],
  ];

  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[.15em] text-blue-700">Minha central</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Acompanhamentos</h1>
        <p className="mt-1 text-sm text-slate-600">As demandas que você decidiu seguir e as que dependem de você.</p>
      </header>

      <nav className="flex gap-1 border-b border-slate-200" aria-label="Filas de acompanhamento">
        {abas.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setAba(key)}
            aria-current={aba === key ? "page" : undefined}
            className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold ${aba === key ? "border-b-2 border-blue-700 text-blue-700" : "text-slate-500 hover:text-slate-800"}`}
          >
            {key === "acompanho" ? <Star className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {label}
          </button>
        ))}
      </nav>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
        {itens.map((d) => (
          <Link key={d.id} href={`/demandas/${d.id}`} className="group flex flex-col gap-3 p-5 hover:bg-slate-50 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-slate-500">{d.numero}</span>
                {d.favorito && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" aria-label="Favorita" />}
                {d.atrasada && <span className="text-xs font-semibold text-red-700">Atrasada</span>}
                {d.bloqueada && <span className="text-xs font-semibold text-orange-700">Bloqueada</span>}
              </div>
              <p className="mt-1 truncate font-semibold text-slate-900 group-hover:text-blue-700">{d.titulo}</p>
              <p className="mt-1 text-xs text-slate-500">{d.setor_atual?.nome || "Sem setor"} · {d.responsavel_geral?.name || "Sem responsável"}</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="w-28">
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-blue-600" style={{ width: `${d.progresso}%` }} /></div>
                <p className="mt-1 text-xs text-slate-500">{d.progresso}% concluído</p>
              </div>
              <div className="min-w-28 text-right">
                <p className="text-sm font-medium text-slate-700">{d.status?.rotulo || "Aberta"}</p>
                <p className={`mt-1 text-xs ${d.atrasada ? "text-red-700" : "text-slate-500"}`}>{d.prazo_final ? `Prazo: ${formatDate(d.prazo_final)}` : "Sem prazo"}</p>
              </div>
            </div>
          </Link>
        ))}

        {carregando && <div className="p-12 text-center text-sm text-slate-500">Carregando…</div>}

        {!carregando && itens.length === 0 && (
          <div className="flex flex-col items-center gap-2 p-12 text-center">
            {aba === "acompanho" ? <Bell className="h-6 w-6 text-slate-300" /> : <CheckCircle2 className="h-6 w-6 text-emerald-400" />}
            <p className="text-sm text-slate-500">
              {aba === "acompanho"
                ? "Você ainda não acompanha nenhuma demanda. Abra uma demanda e clique em Acompanhar."
                : "Nenhuma demanda sob sua gestão em aberto. Você está em dia."}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
