import { useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useProcesso, useEtapasFluxo } from "./hooks";
import { AcoesProcesso } from "./AcoesProcesso";
import { ProximaAcao } from "./ProximaAcao";
import { AbaHistorico } from "./abas/AbaHistorico";
import { AbaPlanejamento } from "./abas/AbaPlanejamento";
import { AbaCompras } from "./abas/AbaCompras";
import { AbaDotacao } from "./abas/AbaDotacao";
import { AbaLicitacao } from "./abas/AbaLicitacao";
import { AbaContrato } from "./abas/AbaContrato";
import { AbaComentarios } from "./abas/AbaComentarios";
import { ROTULOS_TIPO_PROCESSO } from "@/nucleo/tipos";
import { Abas, Cartao, CartaoCorpo, ChipStatus, EstadoErro, FluxoStatus, Skeleton } from "@/ui";

const ABAS = [
  { chave: "historico", rotulo: "Linha do tempo" },
  { chave: "planejamento", rotulo: "Planejamento" },
  { chave: "compras", rotulo: "Compras" },
  { chave: "dotacao", rotulo: "Dotação e Autorização" },
  { chave: "licitacao", rotulo: "Licitação" },
  { chave: "contrato", rotulo: "Contrato" },
  { chave: "comentarios", rotulo: "Comentários" },
];

export function ProcessoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const [abaAtiva, setAbaAtiva] = useState("historico");
  const { data: processo, isLoading, error } = useProcesso(id);
  const { data: etapas } = useEtapasFluxo(id);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-brand-600" />
      </div>
    );
  }

  if (error || !processo) {
    return <EstadoErro mensagem="Não foi possível carregar este processo." />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-900">Processo {processo.numero_processo}</h1>
            <ChipStatus status={processo.status_geral} />
          </div>
          <p className="text-sm text-slate-600">{processo.objeto}</p>
          <p className="mt-0.5 text-xs text-slate-400">
            {ROTULOS_TIPO_PROCESSO[processo.tipo_processo] ?? processo.tipo_processo} · {processo.secretaria_nome}
          </p>
        </div>
        <AcoesProcesso processo={processo} />
      </div>

      <Cartao>
        <CartaoCorpo>
          {etapas ? (
            <FluxoStatus etapas={etapas} etapaAtualCodigo={processo.etapa_atual_codigo} statusGeral={processo.status_geral} />
          ) : (
            <Skeleton className="h-16 w-full" />
          )}
        </CartaoCorpo>
      </Cartao>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <ProximaAcao processo={processo} />
        </div>
        <Cartao className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Responsável atual</p>
          <p className="mt-1 text-sm font-medium text-slate-800">{processo.responsavel_setor ?? "Não definido"}</p>
          {processo.responsavel_usuario && <p className="text-xs text-slate-500">{processo.responsavel_usuario}</p>}
          <p className="mt-2 text-xs text-slate-500">
            Nesta etapa há {processo.dias_na_etapa ?? 0} dia(s)
          </p>
        </Cartao>
      </div>

      <Cartao>
        <Abas itens={ABAS} ativa={abaAtiva} aoSelecionar={setAbaAtiva} />
        <CartaoCorpo>
          {abaAtiva === "historico" && <AbaHistorico processoId={processo.id} />}
          {abaAtiva === "planejamento" && <AbaPlanejamento processoId={processo.id} />}
          {abaAtiva === "compras" && <AbaCompras processoId={processo.id} />}
          {abaAtiva === "dotacao" && <AbaDotacao processoId={processo.id} />}
          {abaAtiva === "licitacao" && <AbaLicitacao processoId={processo.id} />}
          {abaAtiva === "contrato" && <AbaContrato processoId={processo.id} />}
          {abaAtiva === "comentarios" && <AbaComentarios processoId={processo.id} />}
        </CartaoCorpo>
      </Cartao>
    </div>
  );
}
