"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import { ArrowLeft, CalendarClock, Fuel, History, Pencil, X } from "lucide-react";
import { Abastecimento, CorrecaoAbastecimento, api } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";
import { useAuth } from "@/lib/auth";
import { FotoVeiculo } from "@/components/veiculo/FotoVeiculo";
import { FotoAnexo } from "@/components/abastecimento/FotoAnexo";
import { BadgeOrigem, BadgeStatus } from "@/components/abastecimento/Badges";
import { ModalCancelar, ModalCorrigir } from "@/components/abastecimento/ModaisCorrecao";
import {
  formatarConsumo,
  formatarData,
  formatarDataHora,
  formatarKm,
  formatarLitros,
  formatarMoeda,
} from "@/lib/abastecimentos";

interface Evento {
  id: string;
  created_at: string;
  tipo: "REGISTRO" | "CORRECAO" | "CANCELAMENTO";
  titulo: string;
  detalhe?: string;
  por?: string | null;
  justificativa?: string | null;
}

export default function DetalheAbastecimentoPage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const podeGerir = hasPermission("refueling.manage");
  const [a, setA] = useState<Abastecimento | null>(null);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [corrigir, setCorrigir] = useState(false);
  const [cancelar, setCancelar] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const abast = await api.getAbastecimento(id);
      setA(abast);
      const corrs = await api.correcoesAbastecimento(id);
      const ev: Evento[] = [];
      if (abast.created_at) {
        ev.push({
          id: "registro",
          created_at: abast.created_at,
          tipo: "REGISTRO",
          titulo: "Abastecimento registrado",
          por: abast.lancado_por_nome || abast.motorista_nome || "Sistema",
        });
      }
      for (const c of corrs) {
        const ant = c.dados_anteriores_json ? JSON.parse(c.dados_anteriores_json) : null;
        const novo = c.dados_novos_json ? JSON.parse(c.dados_novos_json) : null;
        if (c.tipo_correcao === "CANCELAMENTO") {
          ev.push({
            id: c.id,
            created_at: c.created_at,
            tipo: "CANCELAMENTO",
            titulo: "Abastecimento cancelado",
            por: abast.cancelado_por_nome || "Usuário",
            justificativa: c.justificativa,
          });
        } else {
          const detalhes: string[] = [];
          if (ant?.litros && novo?.litros && ant.litros !== novo.litros) {
            detalhes.push(`Litros: ${Number(ant.litros).toLocaleString("pt-BR")} → ${Number(novo.litros).toLocaleString("pt-BR")} L`);
          }
          if (ant?.km !== undefined && novo?.km !== undefined && ant.km !== novo.km) {
            detalhes.push(`KM: ${Number(ant.km).toLocaleString("pt-BR")} → ${Number(novo.km).toLocaleString("pt-BR")}`);
          }
          ev.push({
            id: c.id,
            created_at: c.created_at,
            tipo: "CORRECAO",
            titulo: "Registro corrigido",
            detalhe: detalhes.length ? detalhes.join(" · ") : undefined,
            justificativa: c.justificativa,
          });
        }
      }
      setEventos(ev);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!a) return <p className="animate-pulse text-text-subtle">Carregando…</p>;

  const custoLitro = a.custo_medio_litro ? formatarMoeda(a.custo_medio_litro) : "—";
  const registradoDepois = a.created_at && new Date(a.created_at).getTime() - new Date(a.data_abastecimento).getTime() > 60 * 60 * 1000;

  return (
    <RequirePermission perms="refueling.view">
      {corrigir && (
        <ModalCorrigir
          abastecimento={a}
          onClose={() => setCorrigir(false)}
          onSalvo={() => { setCorrigir(false); carregar(); }}
        />
      )}
      {cancelar && (
        <ModalCancelar
          abastecimento={a}
          onClose={() => setCancelar(false)}
          onSalvo={() => { setCancelar(false); carregar(); }}
        />
      )}

      <div className="space-y-5">
        <Link href="/abastecimentos" className="inline-flex items-center gap-1 text-body-sm text-text-subtle hover:text-[#1D4ED8]">
          <ArrowLeft size={15} /> Abastecimentos
        </Link>

        {/* Cabeçalho */}
        <div className="flex flex-col gap-4 rounded-2xl border border-outline-variant/30 bg-surface-card p-5 shadow-sm md:flex-row md:items-center">
          <FotoVeiculo src={a.veiculo_foto_url} className="h-16 w-24 flex-shrink-0 rounded-btn border border-outline-variant/30" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-on-background">{a.veiculo_placa ?? "Abastecimento"}</h1>
              <BadgeStatus status={a.status} />
            </div>
            <p className="text-on-surface-variant">{[a.veiculo_marca, a.veiculo_modelo].filter(Boolean).join(" ") || "—"}</p>
            <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-meta tabular-nums text-on-surface-variant">
              <span className="inline-flex items-center gap-1"><CalendarClock size={13} /> {formatarDataHora(a.data_abastecimento)}</span>
              <span className="inline-flex items-center gap-1"><Fuel size={13} /> {a.combustivel_nome ?? "—"}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {podeGerir && a.status === "CONFIRMADO" && (
              <>
                <button className="btn btn-secondary btn-sm" onClick={() => setCorrigir(true)}>
                  <Pencil size={14} /> Corrigir
                </button>
                <button className="btn btn-secondary btn-sm text-[#B42318]" onClick={() => setCancelar(true)}>
                  <X size={14} /> Cancelar
                </button>
              </>
            )}
          </div>
        </div>

        {/* Alerta retroativo */}
        {registradoDepois && (
          <div className="flex items-start gap-2 rounded-2xl border border-warning-vibrant/30 bg-warning-vibrant/10 p-4 text-sm text-[#805600]">
            <CalendarClock size={16} className="mt-0.5 flex-shrink-0" />
            <span>Este lançamento foi registrado depois do fato ocorrido. Verifique as datas abaixo.</span>
          </div>
        )}

        {/* Resumo */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Info titulo="Veículo" valor={`${a.veiculo_placa ?? "—"}${[a.veiculo_marca, a.veiculo_modelo].filter(Boolean).length ? ` • ${[a.veiculo_marca, a.veiculo_modelo].filter(Boolean).join(" ")}` : ""}`} />
          <Info titulo="Motorista" valor={a.motorista_nome ?? "—"} />
          <Info titulo="Combustível" valor={a.combustivel_nome ?? "—"} />
          <Info titulo="Tanque" valor={a.tanque_nome ?? "—"} />
          <Info titulo="Litros" valor={formatarLitros(a.quantidade_litros)} />
          <Info titulo={a.veiculo_usa_horimetro ? "Horímetro" : "KM"} valor={formatarKm(a.quilometragem, a.veiculo_usa_horimetro)} />
          <Info titulo="Tanque cheio" valor={a.completou_tanque === null ? "—" : a.completou_tanque ? "Sim" : "Não"} />
          <Info titulo="Custo" valor={formatarMoeda(a.custo_total)} />
          <Info titulo="Custo / litro" valor={custoLitro} />
          <Info titulo="Consumo calculado" valor={formatarConsumo(a.consumo_km_l)} />
          <Info titulo="Origem" valor={<BadgeOrigem origem={a.origem} />} />
          <Info titulo="Registrado por" valor={a.lancado_por_nome ?? (a.origem === "APP_MOTORISTA" ? "Motorista" : "—")} />
        </div>

        {/* Datas distintas */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-outline-variant/30 bg-surface-card p-4 shadow-sm">
            <div className="text-meta font-medium text-on-surface-variant">Abastecimento realizado</div>
            <div className="mt-1 text-lg font-bold tabular-nums text-on-surface">{formatarDataHora(a.data_abastecimento)}</div>
          </div>
          <div className="rounded-2xl border border-outline-variant/30 bg-surface-card p-4 shadow-sm">
            <div className="text-meta font-medium text-on-surface-variant">Registrado no sistema</div>
            <div className="mt-1 text-lg font-bold tabular-nums text-on-surface">{formatarDataHora(a.created_at)}</div>
          </div>
        </div>

        {/* Fotos */}
        {(a.foto_bomba_url || a.foto_painel_url) && (
          <div className="rounded-2xl border border-outline-variant/30 bg-surface-card p-5 shadow-sm">
            <h2 className="mb-3 text-label font-semibold text-on-surface">Fotos</h2>
            <div className="flex flex-wrap gap-4">
              {a.foto_bomba_url && (
                <div>
                  <div className="mb-1 text-meta text-on-surface-variant">Foto da bomba</div>
                  <FotoAnexo url={a.foto_bomba_url} alt="Foto da bomba" />
                </div>
              )}
              {a.foto_painel_url && (
                <div>
                  <div className="mb-1 text-meta text-on-surface-variant">Foto do painel / KM</div>
                  <FotoAnexo url={a.foto_painel_url} alt="Foto do painel/KM" />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Cancelamento */}
        {a.status === "CANCELADO" && a.motivo_cancelamento && (
          <div className="rounded-2xl border border-error-vibrant/30 bg-error-vibrant/5 p-4">
            <div className="text-meta font-medium text-error-vibrant">Motivo do cancelamento</div>
            <p className="mt-1 text-sm text-on-surface">{a.motivo_cancelamento}</p>
            {a.cancelado_por_nome && (
              <p className="mt-1 text-meta text-on-surface-variant">Cancelado por {a.cancelado_por_nome} em {formatarDataHora(a.cancelado_em)}</p>
            )}
          </div>
        )}

        {a.observacoes && (
          <div className="rounded-2xl border border-outline-variant/30 bg-surface-card p-4 shadow-sm">
            <div className="text-meta font-medium text-on-surface-variant">Observações</div>
            <p className="mt-1 text-sm text-on-surface">{a.observacoes}</p>
          </div>
        )}

        {/* Auditoria */}
        <div id="auditoria" className="rounded-2xl border border-outline-variant/30 bg-surface-card p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-label font-semibold text-on-surface">
            <History size={16} /> Auditoria
          </h2>
          <ol className="relative space-y-5 border-l border-outline-variant/40 pl-5">
            {eventos.length === 0 && <li className="text-sm text-on-surface-variant">Nenhum evento adicional.</li>}
            {eventos.map((ev) => (
              <li key={ev.id} className="relative">
                <span className={`absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-white ${ev.tipo === "CANCELAMENTO" ? "bg-error-vibrant" : ev.tipo === "CORRECAO" ? "bg-info-vibrant" : "bg-secondary"}`} />
                <div className="text-meta text-on-surface-variant">{formatarDataHora(ev.created_at)}</div>
                <div className="font-medium text-on-surface">{ev.titulo}</div>
                {ev.detalhe && <div className="text-sm text-on-surface-variant">{ev.detalhe}</div>}
                {ev.justificativa && <div className="text-sm italic text-on-surface-variant">Justificativa: {ev.justificativa}</div>}
                {ev.por && <div className="text-meta text-on-surface-variant/80">por {ev.por}</div>}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </RequirePermission>
  );
}

function Info({ titulo, valor }: { titulo: string; valor: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-card p-4 shadow-sm">
      <div className="text-meta text-on-surface-variant">{titulo}</div>
      <div className="mt-1 text-base font-bold text-on-surface">{valor}</div>
    </div>
  );
}
