"use client";

import { STATUS_TANQUE } from "@/lib/combustiveis";

/**
 * Badge de status do tanque com texto + cor (não depende só de cor).
 *
 * Deriva o status visual a partir de `ativo` e `status_estoque`:
 * - inativo → "Inativo"
 * - estoque == 0 → "Vazio"
 * - senão usa o status calculado (Crítico / Estoque baixo / Normal)
 */
export function StatusTanqueBadge({
  ativo,
  status,
  estoqueAtual,
}: {
  ativo: boolean;
  status?: string | null;
  estoqueAtual?: number | string | null;
}) {
  let chave = status ?? "NORMAL";
  if (!ativo) chave = "INATIVO";
  else if (Number(estoqueAtual ?? 0) === 0) chave = "VAZIO";

  const cfg = STATUS_TANQUE[chave.toUpperCase()] ?? STATUS_TANQUE.NORMAL;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-meta font-medium ${cfg.bg} ${cfg.cor}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {cfg.rotulo}
    </span>
  );
}
