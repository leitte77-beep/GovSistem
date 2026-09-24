"use client";

/**
 * Quadro por setor. É leitura, não arrasto: só mostra onde cada pedido está
 * e leva para a tela onde a tarefa se trabalha.
 */

import clsx from "clsx";
import { Building2, Send, UserRound } from "lucide-react";
import Link from "next/link";

import { EtiquetaPrazo, EtiquetaSaude } from "@/components/Etiquetas";
import type { PedidoLinha } from "@/lib/api";
import { moeda } from "@/lib/formato";
import { useNomeSetor, useSetores } from "@/lib/setores";

const ABERTOS = new Set(["COM_ASSESSOR", "EM_SETOR", "AGUARDANDO_TERCEIRO"]);

const PONTO: Record<string, string> = {
  COM_ASSESSOR: "bg-brand",
  EM_SETOR: "bg-estado-andamento",
  AGUARDANDO_TERCEIRO: "bg-estado-externo",
};

function CartaoQuadro({ pedido }: { pedido: PedidoLinha }) {
  const valor = Number(pedido.valor_previsto) > 0 ? moeda(pedido.valor_previsto) : null;
  return (
    <Link
      href={`/pedidos/${pedido.id}`}
      className="group relative block overflow-hidden rounded-xl border border-line bg-paper p-3.5 shadow-card transition hover:border-brand/40 hover:shadow-pop"
    >
      <span
        className={clsx("absolute inset-y-0 left-0 w-1", PONTO[pedido.situacao] ?? "bg-brand")}
        aria-hidden
      />
      <div className="pl-2">
        <div className="flex items-center justify-between gap-2">
          <span className="numero rounded border border-line bg-canvas px-1.5 py-0.5">
            {pedido.numero}
          </span>
          {valor && (
            <span className="shrink-0 font-mono text-xs font-bold text-ink">{valor}</span>
          )}
        </div>

        <h4 className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-ink transition-colors group-hover:text-brand">
          {pedido.titulo}
        </h4>

        {pedido.tarefa_atual && (
          <span className="mt-1.5 inline-block max-w-full truncate rounded border border-brand-200/60 bg-brand-50 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-brand-700">
            {pedido.tarefa_atual}
          </span>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <EtiquetaPrazo prazo={pedido.prazo_atual} diasDeAtraso={pedido.dias_de_atraso} />
          <EtiquetaSaude saude={pedido.saude} motivo={pedido.saude_motivo} />
        </div>

        <div className="mt-2 flex items-center gap-1.5 border-t border-line pt-2 text-xs text-ink-muted">
          <UserRound size={12} aria-hidden />
          {pedido.responsavel_atual ? pedido.responsavel_atual.name : "Sem responsável"}
        </div>
      </div>
    </Link>
  );
}

export function QuadroDePedidos({ pedidos }: { pedidos: PedidoLinha[] }) {
  const nomeSetor = useNomeSetor();
  const { setores } = useSetores();

  const grupos = new Map<string, PedidoLinha[]>();
  for (const pedido of pedidos) {
    if (!ABERTOS.has(pedido.situacao)) continue;
    const chave =
      pedido.situacao === "COM_ASSESSOR" ? "ASSESSOR" : pedido.setor_atual ?? "SEM_SETOR";
    const atual = grupos.get(chave);
    if (atual) atual.push(pedido);
    else grupos.set(chave, [pedido]);
  }

  const codigosSetores = setores.filter((s) => s.ativo).map((s) => s.codigo);
  const extras = [...grupos.keys()].filter(
    (c) => c !== "ASSESSOR" && c !== "SEM_SETOR" && !codigosSetores.includes(c)
  );

  const setoresOrdenados = [...codigosSetores].sort((a, b) => {
    const la = grupos.get(a)?.length ?? 0;
    const lb = grupos.get(b)?.length ?? 0;
    if (lb !== la) return lb - la;
    return nomeSetor(a).localeCompare(nomeSetor(b), "pt-BR");
  });

  const chaves = [
    "ASSESSOR",
    ...setoresOrdenados,
    ...(grupos.has("SEM_SETOR") ? ["SEM_SETOR"] : []),
    ...extras,
  ];

  const colunas = chaves.map((chave) => ({
    chave,
    titulo:
      chave === "ASSESSOR"
        ? "Com o Assessor"
        : chave === "SEM_SETOR"
          ? "Sem setor"
          : nomeSetor(chave),
    itens: grupos.get(chave) ?? [],
  }));

  return (
    <div className="rolagem-fina flex gap-4 overflow-x-auto pb-2">
      {colunas.map((coluna) => {
        const ativa = coluna.itens.length > 0;
        const Icone = coluna.chave === "ASSESSOR" ? Send : Building2;
        return (
          <section
            key={coluna.chave}
            className={clsx(
              "flex min-h-[460px] w-72 shrink-0 flex-col rounded-2xl border p-3",
              ativa ? "border-brand/40 bg-canvas/80 shadow-sm" : "border-line bg-canvas/60"
            )}
          >
            <header className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={clsx(
                    "grid h-6 w-6 shrink-0 place-items-center rounded-lg",
                    ativa ? "bg-brand-50 text-brand" : "bg-ink/[.06] text-ink-faint"
                  )}
                >
                  <Icone size={14} aria-hidden />
                </span>
                <h2 className="truncate text-xs font-bold uppercase tracking-wider text-ink">
                  {coluna.titulo}
                </h2>
                {ativa && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />}
              </div>
              <span
                className={clsx(
                  "shrink-0 rounded-pill px-2 py-0.5 text-xs font-bold tabular-nums",
                  ativa ? "bg-brand-50 text-brand" : "bg-ink/[.06] text-ink-muted"
                )}
              >
                {coluna.itens.length}
              </span>
            </header>

            <div className="mt-3 flex flex-1 flex-col gap-3">
              {coluna.itens.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-paper/50 p-6 text-center">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-canvas text-ink-faint">
                    <Icone size={17} aria-hidden />
                  </span>
                  <p className="mt-2 text-xs font-medium text-ink-faint">
                    Nenhum pedido nesta etapa
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-faint/80">Fluxo do setor</p>
                </div>
              ) : (
                coluna.itens.map((pedido) => (
                  <CartaoQuadro key={pedido.id} pedido={pedido} />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
