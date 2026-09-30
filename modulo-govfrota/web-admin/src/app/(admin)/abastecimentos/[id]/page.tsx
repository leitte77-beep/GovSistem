"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Eye,
  FileText,
  Fuel,
  History,
  Images,
  Landmark,
  Pencil,
  Store,
  User,
  X,
} from "lucide-react";
import { Abastecimento, api } from "@/lib/api";
import { RequirePermission } from "@/components/RequirePermission";
import { useAuth } from "@/lib/auth";
import { FotoVeiculo } from "@/components/veiculo/FotoVeiculo";
import { FotoAnexo } from "@/components/abastecimento/FotoAnexo";
import { BadgeOrigem, BadgeStatus } from "@/components/abastecimento/Badges";
import { ModalCancelar, ModalCorrigir } from "@/components/abastecimento/ModaisCorrecao";
import {
  formatarConsumoRegistro,
  formatarDataHora,
  formatarLitros,
  formatarMedicao,
  formatarMoeda,
  localAbastecimento,
  rotuloAlerta,
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

const num2 = (v: number | string | null | undefined) =>
  v == null || v === "" || isNaN(Number(v)) ? "—" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

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
          if (novo?.horimetro && ant?.horimetro !== novo.horimetro) {
            detalhes.push(`Horímetro: ${ant?.horimetro ?? "—"} → ${novo.horimetro} h`);
          }
          if (novo?.preco_litro && ant?.preco_litro !== novo.preco_litro) {
            detalhes.push(`Preço/L: ${ant?.preco_litro ?? "—"} → ${novo.preco_litro}`);
          }
          if (novo?.numero_nf && ant?.numero_nf !== novo.numero_nf) {
            detalhes.push(`NF: ${ant?.numero_nf ?? "—"} → ${novo.numero_nf}`);
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

  const noPosto = a.modalidade === "POSTO_CREDENCIADO";
  const alertas = a.alertas ?? [];
  const registradoDepois = a.created_at && new Date(a.created_at).getTime() - new Date(a.data_abastecimento).getTime() > 60 * 60 * 1000;
  const modelo = [a.veiculo_marca, a.veiculo_modelo].filter(Boolean).join(" ") || "—";
  const precoRotulo = noPosto ? (a.preco_litro ? "Preço pago / litro" : "Preço / litro (estimado)") : "Custo médio / litro";
  const custoLitro = a.custo_medio_litro ? formatarMoeda(a.custo_medio_litro) : "—";
  const protocolo = `#${a.id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

  const conformidade = a.status === "CANCELADO"
    ? { classe: "bg-[#FFDAD6] text-[#410002]", icone: <AlertTriangle size={22} className="shrink-0 text-[#BA1A1A]" />, titulo: "Registro cancelado", texto: "Este abastecimento foi cancelado. Consulte o motivo e a trilha de auditoria." }
    : alertas.length > 0
      ? { classe: "bg-[#FFF4D6] text-[#5C4200]", icone: <AlertTriangle size={22} className="shrink-0 text-[#805600]" />, titulo: "Requer conferência", texto: "O registro foi aceito, mas disparou alertas que pedem conferência com a nota fiscal e o motorista." }
      : { classe: "bg-[#E7F8EC] text-[#0B3D20]", icone: <BadgeCheck size={22} className="shrink-0 text-[#106D34]" />, titulo: "Registro conforme", texto: "Nenhum alerta de conferência. Registro consistente com o histórico da frota." };

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
        {/* Navegação superior e identificação */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/abastecimentos"
            className="group inline-flex items-center gap-2 py-1 text-body-sm font-medium text-secondary transition-colors hover:text-primary"
          >
            <ArrowLeft size={18} className="transition-transform group-hover:-translate-x-0.5" />
            Voltar para Abastecimentos
          </Link>
          <div className="flex flex-wrap items-center gap-2 text-meta text-text-subtle">
            <span className="rounded bg-[#F3F4F6] px-2 py-0.5 font-mono uppercase tracking-wide text-on-surface-variant">ID {protocolo}</span>
            {a.ip_origem && (
              <>
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-outline-variant" />
                <span className="font-mono">IP de origem: {a.ip_origem}</span>
              </>
            )}
          </div>
        </div>

        {/* Cabeçalho principal */}
        <div className="flex flex-col justify-between gap-5 rounded-2xl bg-surface-card p-6 shadow-card ring-1 ring-outline-variant/40 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-5">
            <FotoVeiculo src={a.veiculo_foto_url} className="h-16 w-16 shrink-0 rounded-xl" />
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded bg-navy px-2.5 py-1 font-mono text-base font-semibold tracking-wider text-white shadow-sm">
                  {a.veiculo_placa ?? "—"}
                </span>
                <h1 className="truncate text-h2 text-text-title">{modelo}</h1>
                <BadgeStatus status={a.status} />
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 pt-1 text-body-sm text-text-subtle">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock size={16} className="text-primary" />
                  <span className="font-medium text-text-body">{formatarDataHora(a.data_abastecimento)}</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Fuel size={16} className="text-[#106D34]" />
                  <span className="font-medium text-text-body">{a.combustivel_nome ?? "—"}</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Store size={16} className="text-secondary" />
                  {localAbastecimento(a)}
                </span>
              </div>
            </div>
          </div>
          {podeGerir && a.status === "CONFIRMADO" && (
            <div className="flex shrink-0 items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCorrigir(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-[#F3F4F6] px-4 py-2.5 text-body-sm font-medium text-text-body transition-all hover:bg-surface-container-high active:scale-[0.98]"
              >
                <Pencil size={16} className="text-text-subtle" /> Corrigir
              </button>
              <button
                type="button"
                onClick={() => setCancelar(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-error-container px-4 py-2.5 text-body-sm font-medium text-[#410002] transition-all hover:opacity-90 active:scale-[0.98]"
              >
                <X size={16} /> Cancelar
              </button>
            </div>
          )}
        </div>

        {/* Avisos de integridade */}
        {registradoDepois && (
          <div className="flex items-start gap-2 rounded-2xl border border-warning-vibrant/30 bg-warning-vibrant/10 p-4 text-body-sm text-[#805600]">
            <CalendarClock size={16} className="mt-0.5 shrink-0" />
            <span>Este lançamento foi registrado depois do fato ocorrido. Verifique as datas abaixo.</span>
          </div>
        )}
        {alertas.length > 0 && a.status === "CONFIRMADO" && (
          <div className="flex items-start gap-2 rounded-2xl border border-[#F5C451] bg-[#FFF8E6] p-4 text-body-sm text-[#5C4200]">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold">Conferir este abastecimento</div>
              <ul className="mt-1 list-disc pl-4">
                {alertas.map((c) => <li key={c}>{rotuloAlerta(c)}</li>)}
              </ul>
              <p className="mt-1 text-meta">O registro foi aceito; os alertas pedem conferência com a nota fiscal e o motorista.</p>
            </div>
          </div>
        )}

        {/* Duas colunas */}
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
          {/* Coluna esquerda */}
          <div className="flex flex-col gap-5 lg:col-span-8">
            {/* Especificações do registro */}
            <div className="flex flex-col gap-4 rounded-2xl bg-surface-card p-6 shadow-card ring-1 ring-outline-variant/40">
              <div className="flex items-center justify-between border-b border-outline-variant/30 pb-3">
                <div className="flex items-center gap-2">
                  <ClipboardList size={20} className="text-primary" />
                  <h2 className="text-h3 text-text-title">Especificações do Registro</h2>
                </div>
                <span className="text-meta font-medium uppercase tracking-wider text-text-subtle">Protocolo {protocolo}</span>
              </div>

              <div className="grid grid-cols-1 gap-x-4 gap-y-5 pt-1 sm:grid-cols-2 lg:grid-cols-4">
                <Spec label="Veículo">
                  {a.veiculo_placa ?? "—"} <span className="text-text-subtle">• {modelo}</span>
                </Spec>
                <Spec label="Motorista">
                  <span className="inline-flex items-center gap-1.5"><User size={14} className="text-primary" /> {a.motorista_nome ?? "—"}</span>
                </Spec>
                <Spec label="Combustível">{a.combustivel_nome ?? "—"}</Spec>
                <Spec label={noPosto ? "Posto" : "Tanque"}>
                  <span className="inline-flex items-center gap-1"><Store size={14} className="text-[#106D34]" /> {localAbastecimento(a)}</span>
                </Spec>

                <Metric label="Volume abastecido" accent>
                  <span className="text-3xl font-bold tracking-tight">{num2(a.quantidade_litros)}</span>
                  <span className="text-body font-semibold text-text-subtle">L</span>
                </Metric>
                <Metric label="Custo total">
                  <span className="text-body font-semibold text-text-subtle">R$</span>
                  <span className="text-3xl font-bold tracking-tight">{num2(a.custo_total)}</span>
                </Metric>
                <Metric label={precoRotulo}>
                  <span className="text-h3 font-bold">{custoLitro}</span>
                </Metric>
                <Metric label={a.veiculo_usa_horimetro ? "Horímetro" : "Quilometragem"}>
                  <span className="text-h3 font-bold">{formatarMedicao(a)}</span>
                </Metric>

                <Spec label="Tanque cheio">
                  {a.completou_tanque === null ? (
                    "—"
                  ) : a.completou_tanque ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#E5EEFF] px-2.5 py-0.5 text-meta font-medium text-[#121C2B]">
                      <CheckCircle2 size={13} /> Sim
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-[#F3F4F6] px-2.5 py-0.5 text-meta font-medium text-text-subtle">Não</span>
                  )}
                </Spec>
                <Spec label="Consumo calculado">
                  {formatarConsumoRegistro(a)}
                  <span className="block text-meta font-normal italic text-text-subtle">Disponível após o próximo abastecimento</span>
                </Spec>
                {a.unidade_nome && (
                  <Spec label="Secretaria / Unidade">
                    <span className="inline-flex items-center gap-1"><Landmark size={14} className="text-text-subtle" /> {a.unidade_nome}</span>
                  </Spec>
                )}
                <Spec label="Origem • Registrado por">
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <BadgeOrigem origem={a.origem} />
                    {a.lancado_por_nome && <span className="text-meta font-normal text-text-subtle">{a.lancado_por_nome}</span>}
                  </span>
                </Spec>

                <Spec label="Abastecimento realizado">{formatarDataHora(a.data_abastecimento)}</Spec>
                <Spec label="Registrado no sistema">{formatarDataHora(a.created_at)}</Spec>

                {noPosto && (
                  <div className="flex flex-col gap-1 rounded-xl bg-surface-container-high/40 p-3 sm:col-span-2">
                    <span className="text-meta font-medium uppercase tracking-wider text-text-subtle">Nota Fiscal Eletrônica (NF-e)</span>
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {a.numero_nf ? (
                          <span className="inline-flex items-center gap-1.5 rounded bg-[#E5EEFF] px-2.5 py-1 text-meta font-medium text-[#121C2B]">
                            <FileText size={13} /> NF {a.numero_nf}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded bg-[#F3F4F6] px-2.5 py-1 text-meta font-medium text-text-subtle">
                            <span className="h-1.5 w-1.5 rounded-full bg-outline" /> Pendente de envio pelo posto
                          </span>
                        )}
                        {a.chave_nfe && <span className="break-all font-mono text-meta text-text-subtle">{a.chave_nfe}</span>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Fotos e comprovantes */}
            {(a.foto_bomba_url || a.foto_painel_url) && (
              <div className="flex flex-col gap-4 rounded-2xl bg-surface-card p-6 shadow-card ring-1 ring-outline-variant/40">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Images size={20} className="text-primary" />
                      <h3 className="text-h3 text-text-title">Fotos e Comprovantes</h3>
                    </div>
                    <p className="mt-0.5 text-meta text-text-subtle">
                      Imagens enviadas pelo condutor no momento do abastecimento.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  {a.foto_bomba_url && (
                    <div className="flex flex-col overflow-hidden rounded-xl bg-surface-container-low shadow-sm">
                      <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-container">
                        <FotoAnexo url={a.foto_bomba_url} alt="Foto da bomba" className="h-full w-full !rounded-none !border-0" />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                        <div className="pointer-events-none absolute bottom-3 left-3 text-white">
                          <div className="text-body-sm font-semibold">{formatarLitros(a.quantidade_litros)} • {formatarMoeda(a.custo_total)}</div>
                          <div className="text-meta text-white/80">{formatarDataHora(a.data_abastecimento)}</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-4">
                        <div>
                          <div className="text-body-sm font-semibold text-text-title">Foto da bomba</div>
                          <div className="text-meta text-text-subtle">Registro do bico dosador e valores fiscais</div>
                        </div>
                        <span className="inline-flex items-center gap-1 text-meta text-text-subtle"><Eye size={14} /> Ampliar</span>
                      </div>
                    </div>
                  )}
                  {a.foto_painel_url && (
                    <div className="flex flex-col overflow-hidden rounded-xl bg-surface-container-low shadow-sm">
                      <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-container">
                        <FotoAnexo url={a.foto_painel_url} alt="Foto do painel/KM" className="h-full w-full !rounded-none !border-0" />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                        <div className="pointer-events-none absolute bottom-3 left-3 text-white">
                          <div className="text-body-sm font-semibold">{formatarMedicao(a)}</div>
                          <div className="text-meta text-white/80">{formatarDataHora(a.created_at)}</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-4">
                        <div>
                          <div className="text-body-sm font-semibold text-text-title">Foto do painel / {a.veiculo_usa_horimetro ? "Horímetro" : "KM"}</div>
                          <div className="text-meta text-text-subtle">Hodômetro verificado no registro</div>
                        </div>
                        <span className="inline-flex items-center gap-1 text-meta text-text-subtle"><Eye size={14} /> Ampliar</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Coluna direita */}
          <div className="flex flex-col gap-5 lg:col-span-4">
            {/* Auditoria e rastreabilidade */}
            <div className="flex flex-col gap-4 rounded-2xl bg-surface-card p-6 shadow-card ring-1 ring-outline-variant/40">
              <div className="flex items-center gap-2.5">
                <History size={20} className="text-primary" />
                <div className="flex flex-col">
                  <h3 className="text-body font-semibold text-text-title">Auditoria e Rastreabilidade</h3>
                  <span className="text-meta text-text-subtle">Trilha do registro no período</span>
                </div>
              </div>
              <div className="relative flex flex-col gap-5 pl-6 pt-1">
                <div className="absolute bottom-3 left-2.5 top-3 w-0.5 bg-surface-container-high" />
                {eventos.length === 0 && <p className="text-body-sm text-text-subtle">Nenhum evento adicional.</p>}
                {eventos.map((ev) => {
                  const cfg =
                    ev.tipo === "CANCELAMENTO"
                      ? { dot: "bg-error-vibrant", cor: "text-error-vibrant", label: "Cancelado", icone: <X size={11} /> }
                      : ev.tipo === "CORRECAO"
                        ? { dot: "bg-info-vibrant", cor: "text-info-vibrant", label: "Corrigido", icone: <Pencil size={11} /> }
                        : { dot: "bg-[#106D34]", cor: "text-[#106D34]", label: "Registrado", icone: <CheckCircle2 size={11} /> };
                  return (
                    <div key={ev.id} className="relative flex flex-col gap-1">
                      <span className={`absolute -left-6 top-0.5 flex h-5 w-5 items-center justify-center rounded-full text-white shadow-sm ${cfg.dot}`}>
                        {cfg.icone}
                      </span>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-meta text-text-subtle">{formatarDataHora(ev.created_at)}</span>
                        <span className={`text-meta font-semibold ${cfg.cor}`}>{cfg.label}</span>
                      </div>
                      <p className="text-body-sm font-medium leading-snug text-text-title">{ev.titulo}</p>
                      {ev.detalhe && <p className="text-meta leading-relaxed text-text-subtle">{ev.detalhe}</p>}
                      {ev.justificativa && <p className="text-meta italic text-text-subtle">Justificativa: {ev.justificativa}</p>}
                      {ev.por && <p className="text-meta text-text-subtle/80">por {ev.por}</p>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Status de conformidade */}
            <div className={`flex items-start gap-3 rounded-2xl p-4 shadow-sm ${conformidade.classe}`}>
              {conformidade.icone}
              <div className="flex flex-col gap-0.5">
                <span className="text-body-sm font-semibold">{conformidade.titulo}</span>
                <span className="text-meta leading-snug">{conformidade.texto}</span>
              </div>
            </div>

            {/* Cancelamento */}
            {a.status === "CANCELADO" && a.motivo_cancelamento && (
              <div className="flex flex-col gap-1 rounded-2xl border border-error-vibrant/30 bg-error-vibrant/5 p-4">
                <div className="text-meta font-medium uppercase tracking-wider text-error-vibrant">Motivo do cancelamento</div>
                <p className="text-body-sm text-text-body">{a.motivo_cancelamento}</p>
                {a.cancelado_por_nome && (
                  <p className="text-meta text-text-subtle">Cancelado por {a.cancelado_por_nome} em {formatarDataHora(a.cancelado_em)}</p>
                )}
              </div>
            )}

            {/* Observações */}
            {a.observacoes && (
              <div className="flex flex-col gap-1 rounded-2xl bg-surface-card p-4 shadow-card ring-1 ring-outline-variant/40">
                <div className="text-meta font-medium uppercase tracking-wider text-text-subtle">Observações</div>
                <p className="text-body-sm text-text-body">{a.observacoes}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </RequirePermission>
  );
}

function Spec({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-meta font-medium uppercase tracking-wider text-text-subtle">{label}</span>
      <div className="text-body-sm font-semibold text-text-title">{children}</div>
    </div>
  );
}

function Metric({ label, children, accent = false }: { label: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-surface-container-low p-4">
      <span className="text-meta font-medium uppercase tracking-wider text-text-subtle">{label}</span>
      <div className={`flex items-baseline gap-1 ${accent ? "text-primary" : "text-text-title"}`}>{children}</div>
    </div>
  );
}
