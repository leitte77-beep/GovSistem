import { CheckCircle2, Circle } from "lucide-react";
import type { ProcessoDetalhe } from "@/nucleo/tipos";
import { Cartao } from "@/ui";

/** Motor de "Próxima Ação" (seção 133) — presente em todo processo,
 * respondendo sempre às quatro perguntas da seção 149: o que está
 * acontecendo, quem precisa agir, o que fazer e até quando. */
export function ProximaAcao({ processo }: { processo: ProcessoDetalhe }) {
  if (processo.status_geral === "cancelado") {
    return (
      <Cartao className="border-red-200 bg-red-50/50 p-4">
        <p className="text-sm font-medium text-red-800">Este processo foi cancelado.</p>
        <p className="text-xs text-red-600">Consulte o histórico para ver a justificativa do cancelamento.</p>
      </Cartao>
    );
  }

  if (processo.status_geral === "concluido") {
    return (
      <Cartao className="border-emerald-200 bg-emerald-50/50 p-4">
        <p className="text-sm font-medium text-emerald-800">Fluxo administrativo concluído.</p>
      </Cartao>
    );
  }

  const pendenciasFaltando = processo.pendencias.filter((p) => p.obrigatorio && !p.satisfeito);

  return (
    <Cartao className="border-brand-200 bg-brand-50/40 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">O que precisa acontecer agora?</p>
      {pendenciasFaltando.length === 0 ? (
        <p className="mt-1 text-sm text-slate-800">
          <strong>{processo.responsavel_setor ?? "O responsável pela etapa"}</strong> pode avançar o processo para a
          próxima etapa{processo.proxima_etapa_nome ? `: ${processo.proxima_etapa_nome}` : "."}
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-slate-800">
            <strong>{processo.responsavel_setor ?? "O responsável pela etapa"}</strong> precisa concluir "
            {processo.etapa_atual_nome}" antes de avançar. Faltam {pendenciasFaltando.length} pendência(s):
          </p>
          <ul className="mt-2 space-y-1">
            {processo.pendencias.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-sm">
                {p.satisfeito ? (
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                ) : (
                  <Circle className="size-4 shrink-0 text-slate-300" />
                )}
                <span className={p.satisfeito ? "text-slate-500 line-through" : "text-slate-700"}>
                  {p.descricao}
                  {!p.obrigatorio && <span className="ml-1 text-xs text-slate-400">(opcional)</span>}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {processo.dias_na_etapa !== null && (
        <p className="mt-2 text-xs text-brand-700">
          Nesta etapa há {processo.dias_na_etapa} dia(s).
        </p>
      )}
    </Cartao>
  );
}
