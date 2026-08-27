"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import { ArrowLeft, CalendarClock, Gauge, Wrench } from "lucide-react";
import { Manutencao, api } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";
import { FotoVeiculo } from "@/components/veiculo/FotoVeiculo";

const TIPOS: Record<string, string> = {
  PREVENTIVA: "Preventiva",
  CORRETIVA: "Corretiva",
  REVISAO: "Revisão",
  TROCA_OLEO: "Troca de óleo",
  PNEUS: "Pneus",
  ELETRICA: "Elétrica",
  MECANICA: "Mecânica",
  FUNILARIA: "Funilaria",
  OUTRO: "Outro",
};

const PRIORIDADE: Record<string, { rotulo: string; classe: string }> = {
  BAIXA: { rotulo: "Baixa", classe: "bg-gray-100 text-gray-600" },
  NORMAL: { rotulo: "Normal", classe: "bg-info-vibrant/10 text-info-vibrant" },
  ALTA: { rotulo: "Alta", classe: "bg-warning-vibrant/10 text-warning-vibrant" },
  URGENTE: { rotulo: "Urgente", classe: "bg-error-vibrant/10 text-error-vibrant" },
};

const STATUS: Record<string, { rotulo: string; classe: string }> = {
  ABERTA: { rotulo: "Aberta", classe: "bg-error-vibrant/10 text-error-vibrant" },
  AGUARDANDO_ORCAMENTO: { rotulo: "Aguardando orçamento", classe: "bg-warning-vibrant/10 text-warning-vibrant" },
  APROVADA: { rotulo: "Aprovada", classe: "bg-info-vibrant/10 text-info-vibrant" },
  EM_MANUTENCAO: { rotulo: "Em manutenção", classe: "bg-warning-vibrant/10 text-warning-vibrant" },
  CONCLUIDA: { rotulo: "Concluída", classe: "bg-success-vibrant/10 text-success-vibrant" },
  CANCELADA: { rotulo: "Cancelada", classe: "bg-gray-100 text-gray-600" },
};

function rotulo(mapa: Record<string, string | { rotulo: string; classe: string }>, valor: string | null | undefined): string {
  if (!valor) return "—";
  const v = mapa[valor];
  if (typeof v === "object" && v !== null) return v.rotulo;
  return (v as string) || valor.replace(/_/g, " ");
}

function formatarMoeda(valor: number | string | null | undefined): string {
  const num = Number(valor || 0);
  if (isNaN(num)) return "—";
  return `R$ ${num.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

function formatarData(data: string | null | undefined): string {
  if (!data) return "—";
  const d = new Date(data.length === 10 ? data + "T12:00" : data);
  if (isNaN(d.getTime())) return data;
  return d.toLocaleDateString("pt-BR");
}

export default function DetalheManutencaoPage() {
  const { id } = useParams<{ id: string }>();
  const [m, setM] = useState<Manutencao | null>(null);

  const carregar = useCallback(async () => {
    try {
      setM(await api.getManutencao(id));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!m) return <p className="animate-pulse text-text-subtle">Carregando…</p>;

  const km = m.quilometragem != null
    ? m.veiculo_usa_horimetro
      ? `${m.quilometragem.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`
      : `${m.quilometragem.toLocaleString("pt-BR")} km`
    : null;

  return (
    <RequirePermission perms="maintenance.view">
      <div className="space-y-5">
        <Link href="/manutencoes" className="inline-flex items-center gap-1 text-body-sm text-text-subtle hover:text-[#1D4ED8]">
          <ArrowLeft size={15} /> Manutenções
        </Link>

        {/* Cabeçalho */}
        <div className="flex flex-col gap-4 rounded-2xl border border-outline-variant/30 bg-surface-card p-5 shadow-sm md:flex-row md:items-center">
          <FotoVeiculo src={m.veiculo_foto_url} className="h-16 w-24 flex-shrink-0 rounded-btn border border-outline-variant/30" />
          <div className="min-w-0 flex-1">
            <div className="text-meta font-medium text-on-surface-variant">Manutenção</div>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-on-background">{m.veiculo_placa ?? "—"}</h1>
              <span className="text-on-surface-variant">{[m.veiculo_marca, m.veiculo_modelo].filter(Boolean).join(" ") || "—"}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-surface-container-high px-2 py-0.5 text-[11px] font-bold text-on-surface-variant">{rotulo(TIPOS, m.tipo)}</span>
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${PRIORIDADE[m.prioridade]?.classe ?? "bg-gray-100 text-gray-600"}`}>{rotulo(PRIORIDADE, m.prioridade)}</span>
              <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS[m.status]?.classe ?? "bg-gray-100 text-gray-600"}`}>{rotulo(STATUS, m.status)}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-meta tabular-nums text-on-surface-variant">
              <span className="inline-flex items-center gap-1"><CalendarClock size={13} /> {formatarData(m.data_solicitacao)}</span>
              {km && <span className="inline-flex items-center gap-1"><Gauge size={13} /> {km}</span>}
            </div>
          </div>
        </div>

        {/* Origem */}
        {m.ocorrencia_origem_id && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-info-vibrant/30 bg-info-vibrant/5 p-4">
            <div className="min-w-0">
              <div className="text-meta font-medium text-info-vibrant">Origem</div>
              <div className="text-body font-medium text-on-surface">Ocorrência{m.ocorrencia_placa ? ` · ${m.ocorrencia_placa}` : ""}</div>
              {m.ocorrencia_descricao && <p className="truncate text-sm text-on-surface-variant">{m.ocorrencia_descricao}</p>}
            </div>
            <Link href={`/ocorrencias/${m.ocorrencia_origem_id}`} className="btn btn-secondary btn-sm">
              <Wrench size={14} /> Ver ocorrência
            </Link>
          </div>
        )}

        {/* Descrição */}
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-card p-5 shadow-sm">
          <h2 className="text-label font-semibold text-on-surface">Problema / Descrição</h2>
          <p className="mt-2 text-body text-on-surface">{m.descricao_problema || "—"}</p>
        </div>

        {/* Itens e valores */}
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-label font-semibold text-on-surface">Itens de serviço</h2>
            <div className="text-body font-semibold text-on-surface">Total: <span className="tabular-nums">{formatarMoeda(m.valor_total)}</span></div>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-160 text-body-sm">
              <thead>
                <tr className="border-b border-outline-variant/30 text-left text-meta text-on-surface-variant">
                  <th className="px-3 py-2">Categoria</th>
                  <th className="px-3 py-2">Descrição</th>
                  <th className="px-3 py-2 text-right">Qtd</th>
                  <th className="px-3 py-2 text-right">Unitário</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {(!m.itens || m.itens.length === 0) && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-on-surface-variant">Nenhum item registrado.</td></tr>
                )}
                {m.itens?.map((i) => (
                  <tr key={i.id} className="border-b border-outline-variant/20 last:border-0">
                    <td className="px-3 py-2 capitalize">{i.categoria.replace("_", " ")}</td>
                    <td className="px-3 py-2 text-on-surface-variant">{i.descricao}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{i.quantidade}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(i.valor_unitario)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{formatarMoeda(i.valor_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Observações */}
        {m.observacoes && (
          <div className="rounded-2xl border border-outline-variant/30 bg-surface-card p-5 shadow-sm">
            <h2 className="text-label font-semibold text-on-surface">Observações</h2>
            <p className="mt-2 text-sm text-on-surface">{m.observacoes}</p>
          </div>
        )}
      </div>
    </RequirePermission>
  );
}
