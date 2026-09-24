"use client";

/**
 * Calendário de prazos. Cada dia mostra os pedidos cujo prazo da tarefa aberta
 * cai ali — para o mês inteiro, via filtro de janela de prazo no servidor.
 */

import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import type { PedidoLinha } from "@/lib/api";
import { moeda } from "@/lib/formato";
import { nomeDoMes, paraIso } from "@/lib/visoes";

const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function EventoDoDia({ pedido }: { pedido: PedidoLinha }) {
  const atrasado = pedido.dias_de_atraso > 0;
  return (
    <li>
      <Link
        href={`/pedidos/${pedido.id}`}
        title={`${pedido.numero} · ${pedido.titulo}`}
        className={clsx(
          "block rounded-lg border border-l-2 border-line bg-paper p-1.5 transition hover:shadow-card",
          atrasado ? "border-l-estado-atrasado" : "border-l-brass"
        )}
      >
        <span className="numero block text-[10px]">{pedido.numero}</span>
        <span className="mt-0.5 block line-clamp-2 text-[11px] font-semibold leading-tight text-ink">
          {pedido.titulo}
        </span>
        {Number(pedido.valor_previsto) > 0 && (
          <span className="mt-0.5 block truncate font-mono text-[10px] text-ink-muted">
            {moeda(pedido.valor_previsto)}
          </span>
        )}
      </Link>
    </li>
  );
}

export function CalendarioDePrazos({
  pedidos,
  referencia,
  aoMudarMes,
}: {
  pedidos: PedidoLinha[];
  referencia: Date;
  aoMudarMes: (mes: Date) => void;
}) {
  const hojeIso = paraIso(new Date());

  const porDia = useMemo(() => {
    const mapa = new Map<string, PedidoLinha[]>();
    for (const pedido of pedidos) {
      if (!pedido.prazo_atual) continue;
      const dia = pedido.prazo_atual.slice(0, 10);
      const lista = mapa.get(dia);
      if (lista) lista.push(pedido);
      else mapa.set(dia, [pedido]);
    }
    return mapa;
  }, [pedidos]);

  const celulas = useMemo(() => {
    const ano = referencia.getFullYear();
    const mes = referencia.getMonth();
    const primeiro = new Date(ano, mes, 1);
    const ultimo = new Date(ano, mes + 1, 0);
    const inicio = new Date(ano, mes, 1 - primeiro.getDay());
    const total = Math.ceil((primeiro.getDay() + ultimo.getDate()) / 7) * 7;
    return Array.from(
      { length: total },
      (_, i) => new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i)
    );
  }, [referencia]);

  function mudarMes(delta: number) {
    aoMudarMes(new Date(referencia.getFullYear(), referencia.getMonth() + delta, 1));
  }

  const totalEventos = pedidos.length;

  return (
    <section className="cartao flex flex-col overflow-hidden">
      <div className="flex flex-col items-center justify-between gap-4 border-b border-line bg-canvas/40 px-4 py-3.5 sm:flex-row sm:px-5">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => aoMudarMes(new Date())}
            className="botao-secundario px-3 py-1.5 text-xs"
          >
            Hoje
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={() => mudarMes(-1)}
              aria-label="Mês anterior"
              className="grid h-8 w-8 place-items-center rounded-full border border-line bg-paper text-ink-soft transition-colors hover:bg-canvas active:scale-95"
            >
              <ChevronLeft size={16} aria-hidden />
            </button>
            <h3 className="min-w-[9.5rem] text-center font-display text-xl font-medium capitalize text-ink">
              {nomeDoMes(referencia)}
            </h3>
            <button
              onClick={() => mudarMes(1)}
              aria-label="Próximo mês"
              className="grid h-8 w-8 place-items-center rounded-full border border-line bg-paper text-ink-soft transition-colors hover:bg-canvas active:scale-95"
            >
              <ChevronRight size={16} aria-hidden />
            </button>
          </div>
        </div>

        <div className="hidden items-center gap-4 text-xs text-ink-muted md:flex">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-brass" aria-hidden />
            Vencimento próximo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-brand" aria-hidden />
            Hoje
          </span>
        </div>
      </div>

      <div className="rolagem-fina overflow-x-auto">
        <div className="min-w-[42rem]">
          <div className="grid grid-cols-7 border-b border-line bg-canvas/60 text-center text-[11px] font-bold uppercase tracking-wider text-ink-muted">
            {SEMANA.map((dia) => (
              <div key={dia} className="py-2.5">
                {dia}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-px bg-line">
            {celulas.map((dia) => {
              const iso = paraIso(dia);
              const doDia = porDia.get(iso) ?? [];
              const ehHoje = iso === hojeIso;
              const doMes = dia.getMonth() === referencia.getMonth();
              const fimDeSemana = dia.getDay() === 0 || dia.getDay() === 6;
              return (
                <div
                  key={iso}
                  className={clsx(
                    "flex min-h-[7rem] flex-col p-1.5 sm:min-h-[8rem]",
                    !doMes
                      ? "bg-canvas/60"
                      : fimDeSemana
                        ? "bg-canvas/30"
                        : "bg-paper",
                    ehHoje && "bg-brand-50/40 ring-2 ring-inset ring-brand/60"
                  )}
                >
                  <div className="flex items-center justify-between gap-1">
                    {ehHoje ? (
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-brand text-xs font-bold text-white">
                        {dia.getDate()}
                      </span>
                    ) : (
                      <span
                        className={clsx(
                          "text-xs font-semibold",
                          doMes ? "text-ink-soft" : "text-ink-faint/60"
                        )}
                      >
                        {dia.getDate()}
                      </span>
                    )}
                    {ehHoje && (
                      <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand">
                        Hoje
                      </span>
                    )}
                  </div>

                  <ul className="mt-1.5 space-y-1.5">
                    {doMes &&
                      doDia.slice(0, 3).map((pedido) => (
                        <EventoDoDia key={pedido.id} pedido={pedido} />
                      ))}
                    {doMes && doDia.length > 3 && (
                      <li className="px-1 text-[10px] font-medium text-ink-faint">
                        +{doDia.length - 3} mais
                      </li>
                    )}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center justify-between gap-2 border-t border-line bg-canvas/40 px-4 py-2.5 text-xs text-ink-muted sm:flex-row sm:px-5">
        <span className="flex items-center gap-2">
          <span
            className={clsx(
              "h-2 w-2 rounded-full",
              totalEventos ? "bg-estado-concluido" : "bg-line-strong"
            )}
            aria-hidden
          />
          Exibindo {totalEventos} {totalEventos === 1 ? "evento" : "eventos"} no período
        </span>
        <span className="text-[11px] text-ink-faint">
          Prazos da tarefa aberta em cada pedido
        </span>
      </div>
    </section>
  );
}
