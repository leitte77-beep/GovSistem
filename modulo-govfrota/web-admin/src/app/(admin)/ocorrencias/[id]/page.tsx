"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import { ArrowLeft, CalendarClock, Gauge, History, ImageOff, Pencil, Users, Wrench } from "lucide-react";
import { Ocorrencia, api } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";
import { useAuth } from "@/lib/auth";
import { FotoAnexo } from "@/components/abastecimento/FotoAnexo";
import { BadgeCategoria, BadgeGravidade, BadgeOrigem, BadgeStatus } from "@/components/ocorrencia/Badges";
import { ModalResolver } from "@/components/ocorrencia/ModalResolver";
import { formatarDataHora, formatarKm } from "@/lib/ocorrencias";
interface Evento {
  id: string;
  created_at: string;
  acao: string;
  detalhe?: string;
  ator?: string;
}

export default function DetalheOcorrenciaPage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const podeGerir = hasPermission("occurrence.manage");
  const podeConverter = hasPermission("maintenance.manage");

  const [o, setO] = useState<Ocorrencia | null>(null);
  const [resolver, setResolver] = useState(false);
  const [eventos, setEventos] = useState<Evento[]>([]);

  const carregar = useCallback(async () => {
    try {
      const ocorrencia = await api.getOcorrencia(id);
      setO(ocorrencia);
      const ev: Evento[] = [];
      const regs = await api.auditoria("ocorrencia");
      const doRegistro = regs
        .filter((r) => r.entidade_id === id)
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      if (doRegistro.length === 0 && ocorrencia.created_at) {
        ev.push({
          id: "criacao",
          created_at: ocorrencia.created_at,
          acao: "Ocorrência criada",
          ator: ocorrencia.origem === "APP_MOTORISTA" ? ocorrencia.motorista_nome ?? "Motorista" : ocorrencia.motorista_nome ?? "Escritório",
        });
      }
      for (const r of doRegistro) {
        let acao = r.acao;
        if (r.acao === "ocorrencia.registrar") acao = "Ocorrência criada";
        else if (r.acao === "ocorrencia.resolver") acao = "Ocorrência resolvida";
        else if (r.acao === "ocorrencia.atualizar") acao = "Classificação atualizada";
        else if (r.acao === "ocorrencia.converter_manutencao") acao = "Convertida em manutenção";
        ev.push({
          id: r.id,
          created_at: r.created_at,
          acao,
          detalhe: r.justificativa || undefined,
          ator: r.actor_name || undefined,
        });
      }
      setEventos(ev);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!o) return <p className="animate-pulse text-text-subtle">Carregando…</p>;
  const occId = o.id;

  async function converter() {
    if (!confirm("Converter esta ocorrência em manutenção corretiva? A foto permanece vinculada.")) return;
    try {
      await api.converterEmManutencao(occId);
      toast.success("Convertida em manutenção corretiva.");
      carregar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const registradoPor = o.origem === "APP_MOTORISTA" ? o.motorista_nome : o.motorista_nome ?? "Escritório";
  const kmInfo = formatarKm(o.quilometragem, o.veiculo_usa_horimetro || false);

  return (
    <RequirePermission perms="vehicle.view">
      {resolver && (
        <ModalResolver
          ocorrencia={o}
          onClose={() => setResolver(false)}
          onSalvo={() => { setResolver(false); carregar(); }}
        />
      )}

      <div className="space-y-5">
        <Link href="/ocorrencias" className="inline-flex items-center gap-1 text-body-sm text-text-subtle hover:text-[#1D4ED8]">
          <ArrowLeft size={15} /> Ocorrências
        </Link>

        {/* Cabeçalho */}
        <div className="flex flex-col gap-4 rounded-2xl border border-outline-variant/30 bg-surface-card p-5 shadow-sm md:flex-row md:items-center">
          <div className="min-w-0 flex-1">
            <div className="text-meta font-medium text-on-surface-variant">Ocorrência</div>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-on-background">{o.veiculo_placa ?? "—"}</h1>
              <span className="text-on-surface-variant">{[o.veiculo_marca, o.veiculo_modelo].filter(Boolean).join(" ") || "—"}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <BadgeCategoria categoria={o.categoria} />
              <BadgeGravidade gravidade={o.gravidade} />
              <BadgeStatus status={o.status} />
              <BadgeOrigem origem={o.origem} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-meta tabular-nums text-on-surface-variant">
              <span className="inline-flex items-center gap-1"><CalendarClock size={13} /> {formatarDataHora(o.created_at || o.data_ocorrencia)}</span>
              {o.quilometragem != null && <span className="inline-flex items-center gap-1"><Gauge size={13} /> {kmInfo}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {podeGerir && o.status !== "RESOLVIDA" && !o.manutencao_id && (
              <button className="btn btn-secondary btn-sm" onClick={() => setResolver(true)}>
                <Pencil size={14} /> Resolver
              </button>
            )}
            {podeConverter && !o.manutencao_id && o.status !== "RESOLVIDA" && (
              <button className="btn btn-primary btn-sm" onClick={converter}>
                <Wrench size={14} /> Converter em manutenção
              </button>
            )}
            {o.manutencao_id && (
              <Link href={`/manutencoes/${o.manutencao_id}`} className="btn btn-secondary btn-sm">
                <Wrench size={14} /> Ver manutenção
              </Link>
            )}
          </div>
        </div>

        {/* Descrição */}
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-card p-5 shadow-sm">
          <h2 className="text-label font-semibold text-on-surface">Problema informado</h2>
          <p className="mt-2 text-body text-on-surface">{o.descricao}</p>
        </div>

        {/* Fotos */}
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-card p-5 shadow-sm">
          <h2 className="text-label font-semibold text-on-surface">Fotos do problema</h2>
          {o.foto_url ? (
            <div className="mt-3 flex flex-wrap gap-3">
              <FotoAnexo url={o.foto_url} alt="Foto da ocorrência" className="h-32 w-32" />
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2 text-sm text-on-surface-variant">
              <ImageOff size={16} /> Nenhuma foto anexada a esta ocorrência.
            </div>
          )}
        </div>

        {/* Registrado por */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-outline-variant/30 bg-surface-card p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-label font-semibold text-on-surface"><Users size={16} /> Registrado por</h2>
            <div className="mt-2 text-body font-medium text-on-surface">{registradoPor || "—"}</div>
            <div className="mt-1 text-meta text-on-surface-variant">
              {o.veiculo_placa ?? "—"} · {[o.veiculo_marca, o.veiculo_modelo].filter(Boolean).join(" ") || "—"}
            </div>
            {o.quilometragem != null && (
              <div className="mt-1 text-meta tabular-nums text-on-surface-variant">{kmInfo}</div>
            )}
            <div className="mt-1 text-meta text-on-surface-variant">{formatarDataHora(o.created_at || o.data_ocorrencia)}</div>
          </div>

          {/* Auditoria */}
          <div className="rounded-2xl border border-outline-variant/30 bg-surface-card p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-label font-semibold text-on-surface"><History size={16} /> Histórico</h2>
            <ol className="relative mt-3 space-y-4 border-l border-outline-variant/40 pl-5">
              {eventos.length === 0 && <li className="text-sm text-on-surface-variant">Nenhum evento adicional.</li>}
              {eventos.map((ev) => (
                <li key={ev.id} className="relative">
                  <span className="absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-white bg-secondary" />
                  <div className="text-meta text-on-surface-variant">{formatarDataHora(ev.created_at)}</div>
                  <div className="font-medium text-on-surface">{ev.acao}</div>
                  {ev.detalhe && <div className="text-sm italic text-on-surface-variant">Justificativa: {ev.detalhe}</div>}
                  {ev.ator && <div className="text-sm text-on-surface-variant">por {ev.ator}</div>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </RequirePermission>
  );
}
