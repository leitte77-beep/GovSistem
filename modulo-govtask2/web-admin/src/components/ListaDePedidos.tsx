"use client";

import clsx from "clsx";
import { ChevronRight, Clock, Inbox, ScrollText } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";

import {
  EtiquetaMotivo,
  EtiquetaParado,
  EtiquetaPrazo,
  EtiquetaSaude,
  EtiquetaSetor,
  EtiquetaSituacao,
  EtiquetaTipo,
} from "@/components/Etiquetas";
import { api, type PedidoLinha } from "@/lib/api";
import { moeda } from "@/lib/formato";
import { useSessao } from "@/lib/sessao";

const PONTO: Record<string, string> = {
  COM_ASSESSOR: "bg-brand",
  EM_SETOR: "bg-estado-andamento",
  AGUARDANDO_TERCEIRO: "bg-estado-externo",
  CONCLUIDO: "bg-estado-concluido",
  CANCELADO: "bg-estado-cancelado",
};

const FECHADOS = ["CONCLUIDO", "CANCELADO"];

function CartaoPedido({
  pedido,
  assumindo,
  aoAssumir,
}: {
  pedido: PedidoLinha;
  assumindo: boolean;
  aoAssumir: (p: PedidoLinha) => void;
}) {
  const { eu } = useSessao();
  const valor = Number(pedido.valor_previsto) > 0 ? moeda(pedido.valor_previsto) : null;
  const fechado = FECHADOS.includes(pedido.situacao);
  const podeAssumir = !pedido.responsavel_atual && !fechado && eu?.pode_trabalhar;
  const tom = PONTO[pedido.situacao] ?? PONTO.CANCELADO;

  return (
    <article className="group relative overflow-hidden rounded-card border border-line bg-paper p-5 shadow-card transition-all duration-200 hover:border-brand/50 hover:shadow-pop">
      <span
        className={clsx("absolute bottom-3 left-0 top-3 w-1 rounded-r-full transition-transform group-hover:scale-y-105", tom)}
        aria-hidden
      />

      <div className="flex flex-col gap-4 pl-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span
                className={clsx("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", tom)}
                aria-hidden
              />
              <span className={clsx("relative inline-flex h-2.5 w-2.5 rounded-full", tom)} aria-hidden />
            </span>
            <Link
              href={`/pedidos/${pedido.id}`}
              className="numero rounded-md border border-line bg-canvas px-2.5 py-1 tracking-wider transition-colors hover:border-line-strong hover:text-ink"
            >
              {pedido.numero}
            </Link>
            <Link href={`/pedidos/${pedido.id}`} className="min-w-0">
              <h3 className="truncate text-base font-semibold tracking-tight text-ink transition-colors group-hover:text-brand sm:text-lg">
                {pedido.titulo}
              </h3>
            </Link>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-4 lg:justify-end">
            {valor && (
              <div className="text-right">
                <div className="font-mono text-lg font-bold tracking-tight text-ink sm:text-xl">
                  {valor}
                </div>
                <div className="text-[11px] font-medium text-ink-faint">Valor previsto</div>
              </div>
            )}
            <Link
              href={`/pedidos/${pedido.id}`}
              aria-label={`Abrir ${pedido.numero}`}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-canvas text-ink-faint transition-colors group-hover:bg-brand-50 group-hover:text-brand"
            >
              <ChevronRight
                size={18}
                className="transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <EtiquetaSituacao situacao={pedido.situacao} />
          <EtiquetaTipo tipo={pedido.tipo} />
          {pedido.tarefa_atual && (
            <span className="etiqueta bg-brand-50 font-bold uppercase tracking-wide text-brand-700">
              {pedido.tarefa_atual}
            </span>
          )}
          <EtiquetaSetor setor={pedido.setor_atual} />
          {!fechado && <EtiquetaParado dias={pedido.dias_na_situacao} />}
          <EtiquetaMotivo motivo={pedido.motivo_parada} />
          <EtiquetaPrazo prazo={pedido.prazo_atual} diasDeAtraso={pedido.dias_de_atraso} />
          <EtiquetaSaude saude={pedido.saude} motivo={pedido.saude_motivo} />
        </div>

        {pedido.motivo_parada_texto && (
          <p className="truncate text-xs text-estado-info">{pedido.motivo_parada_texto}</p>
        )}

        <div className="flex flex-col gap-3 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 text-xs text-ink-muted">
            <span className="font-bold text-ink-soft">Próxima ação: </span>
            <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded border border-brand-200/60 bg-brand-50 px-2 py-0.5 font-medium text-brand-700">
              <ScrollText size={12} aria-hidden />
              {pedido.proxima_acao || pedido.tarefa_atual || "—"}
            </span>
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Link href={`/pedidos/${pedido.id}`} className="botao-secundario text-xs">
              Ver histórico
            </Link>
            {podeAssumir ? (
              <button
                onClick={() => aoAssumir(pedido)}
                disabled={assumindo}
                className="botao-primario text-xs"
              >
                {assumindo && <Clock size={14} className="animate-spin" aria-hidden />}
                Assumir e abrir
              </button>
            ) : (
              <Link href={`/pedidos/${pedido.id}`} className="botao-primario text-xs">
                Abrir pedido
              </Link>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export function ListaDePedidos({
  pedidos,
  vazio = "Nada por aqui.",
}: {
  pedidos: PedidoLinha[];
  vazio?: string;
}) {
  const router = useRouter();
  const [assumindo, setAssumindo] = useState<string | null>(null);

  async function assumir(p: PedidoLinha) {
    setAssumindo(p.id);
    try {
      const completo = await api.obter(p.id);
      const enc = completo.encaminhamento_atual;
      if (!enc) throw new Error("Esta tarefa não está mais aberta.");
      await api.assumir(p.id, enc.id);
      toast.success("Tarefa assumida. Ela é sua agora.");
      router.push(`/pedidos/${p.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAssumindo(null);
    }
  }

  if (pedidos.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-canvas text-ink-faint">
          <Inbox size={20} aria-hidden />
        </span>
        <p className="text-sm text-ink-muted">{vazio}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pedidos.map((pedido) => (
        <CartaoPedido
          key={pedido.id}
          pedido={pedido}
          assumindo={assumindo === pedido.id}
          aoAssumir={assumir}
        />
      ))}
    </div>
  );
}
