"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";
import { PERM } from "@/lib/perfil";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { notify } from "@/components/ui/Toast";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { Gavel, FileSignature, ArrowRight, CalendarClock } from "lucide-react";
import type { Contrato, Licitacao } from "@/types/govtask";

type LicitacaoItem = Licitacao & { processo_titulo?: string };
type ContratoItem = Contrato & { processo_titulo?: string };

const STATUS_CONTRATO: Record<string, string> = {
  RASCUNHO: "Rascunho",
  ASSINADO: "Assinado",
  EM_VIGENCIA: "Em vigência",
  CONCLUIDO: "Concluído",
  ENCERRADO: "Encerrado",
  RESCINDIDO: "Rescindido",
};

const SITUACAO_LICITACAO: Record<string, { label: string; cor: string }> = {
  PREPARATORIA: { label: "Fase preparatória", cor: "bg-[#F2F4F7] text-[#475467]" },
  EDITAL_PUBLICADO: { label: "Edital publicado", cor: "bg-[#EFF8FF] text-[#175CD3]" },
  EM_DISPUTA: { label: "Em disputa", cor: "bg-[#FFFAEB] text-[#B54708]" },
  JULGAMENTO: { label: "Em julgamento", cor: "bg-[#FFFAEB] text-[#B54708]" },
  HOMOLOGADA: { label: "Homologada", cor: "bg-[#ECFDF3] text-[#027A48]" },
  ADJUDICADA: { label: "Adjudicada", cor: "bg-[#ECFDF3] text-[#027A48]" },
  ANULADA: { label: "Anulada", cor: "bg-[#FEF3F2] text-[#B42318]" },
  DESERTA: { label: "Deserta", cor: "bg-[#FEF3F2] text-[#B42318]" },
};

/** Situações que ainda demandam trabalho do setor. */
const LICITACAO_ENCERRADA = ["HOMOLOGADA", "ADJUDICADA", "ANULADA", "DESERTA"];

function LicitacoesConteudo() {
  const [aba, setAba] = useState<"licitacoes" | "contratos">("licitacoes");
  const [licitacoes, setLicitacoes] = useState<LicitacaoItem[]>([]);
  const [contratos, setContratos] = useState<ContratoItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [l, c] = await Promise.all([
        api.listLicitacoesDoTenant({ limit: 200 }),
        api.listContratosDoTenant({ limit: 200 }),
      ]);
      setLicitacoes(l as LicitacaoItem[]);
      setContratos(c as ContratoItem[]);
    } catch (e: any) {
      notify.error(e.message || "Não foi possível carregar as contratações");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const emAndamento = licitacoes.filter(
    (l) => !LICITACAO_ENCERRADA.includes(l.situacao)
  ).length;
  const contratosVigentes = contratos.filter((c) => c.status === "EM_VIGENCIA").length;
  const vencendo = contratos.filter((c) => {
    if (!c.vigencia_fim) return false;
    const dias = (new Date(c.vigencia_fim).getTime() - Date.now()) / 86400000;
    return dias >= 0 && dias <= 30;
  });

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Licitações & Contratos"
        description="Demandas de contratação vinculadas aos processos de recurso"
      />

      {/* Resumo do setor */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Resumo icone={<Gavel className="w-5 h-5" />} rotulo="Licitações em andamento" valor={emAndamento} />
        <Resumo icone={<FileSignature className="w-5 h-5" />} rotulo="Contratos vigentes" valor={contratosVigentes} />
        <Resumo
          icone={<CalendarClock className="w-5 h-5" />}
          rotulo="Vencendo em 30 dias"
          valor={vencendo.length}
          alerta={vencendo.length > 0}
        />
      </div>

      {/* Alternância */}
      <div className="flex items-center gap-1 border-b border-[#E4E7EC]">
        {(["licitacoes", "contratos"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setAba(k)}
            className={cn(
              "px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors",
              aba === k
                ? "border-[#1D4ED8] text-[#1D4ED8]"
                : "border-transparent text-[#667085] hover:text-[#344054]"
            )}
          >
            {k === "licitacoes" ? `Licitações (${licitacoes.length})` : `Contratos (${contratos.length})`}
          </button>
        ))}
      </div>

      {aba === "licitacoes" ? (
        licitacoes.length === 0 ? (
          <EmptyState
            icon="file-text"
            title="Nenhuma licitação registrada"
            description="Quando um processo autorizar a contratação, a licitação registrada por este setor aparecerá aqui."
          />
        ) : (
          <div className="space-y-2">
            {licitacoes.map((l) => {
              const s = SITUACAO_LICITACAO[l.situacao] || { label: l.situacao, cor: "bg-[#F2F4F7] text-[#475467]" };
              return (
                <Link
                  key={l.id}
                  href={`/convenios/${l.convenio_id}?tab=licitacoes`}
                  className="flex items-center gap-4 bg-white border border-[#E4E7EC] rounded-xl px-4 py-3.5 hover:border-[#1D4ED8]/40 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] font-semibold text-[#101828]">
                        {l.numero || "Sem número"}
                      </span>
                      <span className={cn("text-[11px] px-2 py-0.5 rounded-pill font-medium", s.cor)}>
                        {s.label}
                      </span>
                      {l.modalidade && (
                        <span className="text-[12px] text-[#667085]">{l.modalidade}</span>
                      )}
                    </div>
                    <p className="text-[13px] text-[#475467] mt-0.5 truncate">
                      {l.objeto || l.processo_titulo || "—"}
                    </p>
                    <p className="text-[12px] text-[#98A2B3] mt-0.5 truncate">
                      Processo: {l.processo_titulo || "—"}
                      {l.vencedor ? ` · Vencedor: ${l.vencedor}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0 hidden sm:block">
                    <p className="text-[13px] font-semibold text-[#101828] tabular-nums">
                      {formatCurrency(l.valor_contratado ?? l.valor_estimado)}
                    </p>
                    <p className="text-[12px] text-[#98A2B3]">{formatDate(l.data_homologacao || l.data_disputa)}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#98A2B3] shrink-0" />
                </Link>
              );
            })}
          </div>
        )
      ) : contratos.length === 0 ? (
        <EmptyState
          icon="file-text"
          title="Nenhum contrato registrado"
          description="Os contratos celebrados a partir das licitações aparecerão aqui, com vigência e aditivos."
        />
      ) : (
        <div className="space-y-2">
          {contratos.map((c) => (
            <Link
              key={c.id}
              href={`/convenios/${c.convenio_id}?tab=contratos`}
              className="flex items-center gap-4 bg-white border border-[#E4E7EC] rounded-xl px-4 py-3.5 hover:border-[#1D4ED8]/40 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[14px] font-semibold text-[#101828]">{c.numero || "Sem número"}</span>
                  <Badge
                    label={STATUS_CONTRATO[c.status] || c.status}
                    color={c.status === "EM_VIGENCIA" ? "bg-[#ECFDF3] text-[#027A48]" : undefined}
                  />
                  {(c.aditivos?.length ?? 0) > 0 && (
                    <span className="text-[12px] text-[#667085]">{c.aditivos!.length} aditivo(s)</span>
                  )}
                </div>
                <p className="text-[13px] text-[#475467] mt-0.5 truncate">{c.fornecedor || "—"}</p>
                <p className="text-[12px] text-[#98A2B3] mt-0.5 truncate">
                  Processo: {c.processo_titulo || "—"}
                </p>
              </div>
              <div className="text-right shrink-0 hidden sm:block">
                <p className="text-[13px] font-semibold text-[#101828] tabular-nums">
                  {formatCurrency(c.valor)}
                </p>
                <p className="text-[12px] text-[#98A2B3]">
                  {c.vigencia_fim ? `até ${formatDate(c.vigencia_fim)}` : "—"}
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-[#98A2B3] shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Resumo({
  icone,
  rotulo,
  valor,
  alerta,
}: {
  icone: React.ReactNode;
  rotulo: string;
  valor: number;
  alerta?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
            alerta ? "bg-[#FFFAEB] text-[#B54708]" : "bg-[#EFF8FF] text-[#175CD3]"
          )}
        >
          {icone}
        </div>
        <div className="min-w-0">
          <p className="text-[24px] leading-none font-bold text-[#101828] tabular-nums">{valor}</p>
          <p className="text-[12px] text-[#667085] mt-1 truncate">{rotulo}</p>
        </div>
      </div>
    </Card>
  );
}

export default function Page() {
  return (
    <RequirePermission anyOf={[PERM.LICITACAO, PERM.VIEW]}>
      <LicitacoesConteudo />
    </RequirePermission>
  );
}
