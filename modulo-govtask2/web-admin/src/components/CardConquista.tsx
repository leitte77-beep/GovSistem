"use client";

/**
 * Card de conquista (§147): o resumo de uma demanda estratégica concluída.
 * Usa só o que foi registrado — sem inventar beneficiário nem resultado.
 */

import { Trophy } from "lucide-react";

import type { Pedido } from "@/lib/api";
import { ROTULO_ORIGEM, data, moeda } from "@/lib/formato";

export function CardConquista({ pedido }: { pedido: Pedido }) {
  if (pedido.situacao !== "CONCLUIDO") return null;

  const valor = pedido.valor_pago ?? pedido.valor_liberado ?? pedido.valor_previsto;
  const linhas: [string, string][] = [
    ["Objeto", pedido.titulo],
    ["Valor final", moeda(valor)],
    ["Origem", pedido.origem_nome || ROTULO_ORIGEM[pedido.origem] || pedido.origem],
  ];
  if (pedido.concluido_em) linhas.push(["Conclusão", data(pedido.concluido_em)]);

  return (
    <div className="cartao border-estado-concluido/25 bg-estado-concluido/[.04] p-5">
      <h2 className="flex items-center gap-2 font-medium text-estado-concluido">
        <Trophy size={17} aria-hidden />
        Demanda concluída
      </h2>
      <dl className="mt-3 space-y-2 text-sm">
        {linhas.map(([rotulo, texto]) => (
          <div key={rotulo} className="flex justify-between gap-3">
            <dt className="text-ink-muted">{rotulo}</dt>
            <dd className="text-right font-medium text-ink">{texto}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
