"use client";

import { Component, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  Truck,
  Fuel,
  Wrench,
  AlertTriangle,
  TrendingUp,
  Gauge,
  CircleSlash,
  ClipboardList,
  CalendarClock,
  Droplets,
  Plus,
  ArrowRight,
  FileText,
  BarChart3,
  RefreshCw,
  CheckCircle2,
  Users,
  ClipboardCheck,
} from "lucide-react";
import { api, Dashboard } from "@/lib/api";
import { useAuth } from "@/lib/auth";

// ── Formatadores ─────────────────────────────────────────────────────────────

const nf = (v: number, casas = 0) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function rotuloMes(mes: string, curto = false) {
  const [ano, m] = mes.split("-");
  const nome = MESES[Number(m) - 1] ?? mes;
  return curto ? `${nome.slice(0, 3)}/${ano.slice(2)}` : `${nome} de ${ano}`;
}

function dataCompleta(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

function dataHumana(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const mesmoDia = d.toDateString() === hoje.toDateString();
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  if (mesmoDia) return `Hoje às ${hora}`;
  if (d.toDateString() === ontem.toDateString()) return `Ontem às ${hora}`;
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${hora}`;
}

// ── Primitivas visuais ───────────────────────────────────────────────────────

function Bloco({
  titulo,
  descricao,
  acao,
  children,
  className = "",
}: {
  titulo: string;
  descricao?: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col rounded-card border border-surface-border bg-white shadow-card ${className}`}>
      <header className="flex items-start justify-between gap-3 border-b border-surface-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-label font-semibold text-text-title">{titulo}</h2>
          {descricao && <p className="text-meta text-text-subtle">{descricao}</p>}
        </div>
        {acao}
      </header>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col p-5">{children}</div>
    </section>
  );
}

function VerTodos({ href, label = "Ver todos" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-meta font-medium text-[#1D5BD6] hover:underline">
      {label} <ArrowRight size={13} />
    </Link>
  );
}

function EstadoVazio({
  icone: Icone,
  titulo,
  descricao,
  acao,
}: {
  icone: React.ElementType;
  titulo: string;
  descricao: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-4 py-5 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-bg text-text-subtle">
        <Icone size={18} />
      </div>
      <p className="text-body-sm font-medium text-text-title">{titulo}</p>
      <p className="max-w-xs text-meta text-text-subtle">{descricao}</p>
      {acao}
    </div>
  );
}

/** Card principal — o número é o elemento dominante (padrão MD3 do layout). */
function CardPrincipal({
  titulo,
  valor,
  sub,
  icone: Icone,
  cor,
  href,
}: {
  titulo: string;
  valor: string;
  sub?: string;
  icone: React.ElementType;
  cor: string;
  href?: string;
}) {
  // Valores muito longos (R$ 1.250.840,55) reduzem a fonte em vez de serem cortados.
  const escalaValor =
    valor.length > 12
      ? "text-[clamp(1.125rem,1.2vw,1.75rem)]"
      : valor.length > 9
      ? "text-[clamp(1.5rem,1.9vw,2.375rem)]"
      : "text-[clamp(1.875rem,2.3vw,2.75rem)]";

  const conteudo = (
    <div className="ring-focus flex h-32 flex-col justify-between rounded-card border border-[#C3C6D1]/20 bg-white p-5 shadow-card transition-shadow duration-150 hover:shadow-elevated">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#424750]">{titulo}</span>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded ${cor}`}>
          <Icone size={18} />
        </span>
      </div>
      <div className="min-w-0">
        <div
          className={`truncate font-bold leading-tight tracking-tight text-[#181C22] tabular-nums ${escalaValor}`}
          title={valor}
        >
          {valor}
        </div>
        <div className="mt-0.5 min-h-4 truncate text-xs text-[#737781]">{sub ?? ""}</div>
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {conteudo}
    </Link>
  ) : (
    conteudo
  );
}

/** Indicador secundário compacto — card MD3 com ícone circular. */
function Indicador({
  titulo,
  valor,
  icone: Icone,
  cor,
  href,
  alerta,
}: {
  titulo: string;
  valor: number;
  icone: React.ElementType;
  cor: string;
  href?: string;
  alerta?: boolean;
}) {
  const conteudo = (
    <div className="flex min-w-0 items-center gap-4 rounded-card border border-[#C3C6D1]/20 bg-white p-4 shadow-card transition-shadow duration-150 hover:shadow-elevated">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${cor}`}>
        <Icone size={16} />
      </span>
      <div className="min-w-0">
        <div className="line-clamp-2 text-xs text-[#737781]" title={titulo}>{titulo}</div>
        <div className={`text-lg font-semibold leading-tight tabular-nums ${alerta && valor > 0 ? "text-[#BA1A1A]" : "text-[#181C22]"}`}>
          {valor}
        </div>
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="ring-focus block min-w-0">
      {conteudo}
    </Link>
  ) : (
    conteudo
  );
}

// ── Tanques ──────────────────────────────────────────────────────────────────

const ESTOQUE_TEMA = {
  CRITICO: { barra: "bg-[#BA1A1A]", pill: "bg-[#FFDAD6] text-[#BA1A1A]", texto: "Estoque crítico", icone: "bg-[#FFDAD6] text-[#BA1A1A]" },
  BAIXO: { barra: "bg-[#805600]", pill: "bg-[#FFDD9A] text-[#805600]", texto: "Estoque baixo", icone: "bg-[#FFDD9A] text-[#805600]" },
  NORMAL: { barra: "bg-[#106D34]", pill: "bg-[#9DF6B3] text-[#106D34]", texto: "Normal", icone: "bg-[#9DF6B3] text-[#106D34]" },
} as const;

function CardTanque({ tanque }: { tanque: Dashboard["tanques"][number] }) {
  const tema = ESTOQUE_TEMA[(tanque.status_estoque as keyof typeof ESTOQUE_TEMA) ?? "NORMAL"] ?? ESTOQUE_TEMA.NORMAL;
  const temCapacidade = tanque.capacidade != null && tanque.capacidade > 0 && tanque.percentual != null;
  return (
    <Link
      href={`/tanques/${tanque.id}`}
      className="ring-focus flex flex-col gap-3 rounded-card border border-surface-border bg-white p-5 shadow-card transition-shadow duration-150 hover:shadow-elevated"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`flex h-9 w-9 items-center justify-center rounded-btn ${tema.icone}`}>
            <Droplets size={17} />
          </span>
          <div className="min-w-0">
            <div className="truncate text-label font-semibold text-text-title">{tanque.combustivel || "Combustível"}</div>
            <div className="truncate text-meta text-text-subtle">{tanque.nome}</div>
          </div>
        </div>
        <span className={`rounded-pill px-2 py-0.5 text-meta font-medium ${tema.pill}`}>{tema.texto}</span>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-h1 leading-9 text-text-title tabular-nums">{nf(tanque.estoque_atual, 2)} L</span>
        {temCapacidade ? (
          <span className="text-meta text-text-subtle">de {nf(tanque.capacidade!)} L</span>
        ) : (
          <span className="text-meta text-text-subtle">em estoque</span>
        )}
      </div>

      {temCapacidade ? (
        <div>
          <div
            className="h-2.5 overflow-hidden rounded-full bg-surface-bg"
            role="progressbar"
            aria-valuenow={Math.round(tanque.percentual!)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Nível do ${tanque.nome}`}
          >
            <div className={`h-full rounded-full ${tema.barra}`} style={{ width: `${Math.max(Math.min(tanque.percentual!, 100), 1)}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-x-3 text-meta text-text-body">
            <span className="font-medium">{tanque.percentual!.toFixed(0)}% disponível</span>
            <span className="text-text-subtle">
              {tanque.estoque_minimo > 0 ? `Estoque mínimo: ${nf(tanque.estoque_minimo)} L` : "Sem estoque mínimo definido"}
            </span>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap justify-between gap-x-3 text-meta">
          <span className="text-text-subtle">Capacidade não informada</span>
          {tanque.estoque_minimo > 0 && <span className="text-text-subtle">Estoque mínimo: {nf(tanque.estoque_minimo)} L</span>}
        </div>
      )}
    </Link>
  );
}

// ── Gráfico de gastos ────────────────────────────────────────────────────────

function GraficoGastos({ dados }: { dados: Dashboard["graficos"]["evolucao_mensal"] }) {
  const comDados = dados.some((m) => m.gasto > 0);
  if (!comDados) {
    return (
      <EstadoVazio
        icone={BarChart3}
        titulo="Ainda não há dados de consumo"
        descricao="Registre os primeiros abastecimentos para acompanhar os gastos da frota."
        acao={
          <Link href="/abastecimentos" className="btn btn-secondary btn-sm mt-1">
            Registrar abastecimento
          </Link>
        }
      />
    );
  }
  const maxGasto = Math.max(...dados.map((m) => m.gasto), 1);
  return (
    <div className="flex h-72 items-end gap-3 sm:gap-5">
      {dados.map((m) => (
        <div key={m.mes} className="group relative flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
          <span className="max-w-full truncate text-meta font-medium text-text-body opacity-0 transition-opacity group-hover:opacity-100">
            {m.gasto > 0 ? brl(m.gasto) : ""}
          </span>
          <div
            className="w-full rounded-t-md bg-[#1D5BD6] transition-colors group-hover:bg-[#1E40AF]"
            style={{ height: `${Math.max((m.gasto / maxGasto) * 220, m.gasto > 0 ? 6 : 3)}px` }}
          />
          <span className="max-w-full truncate text-meta text-text-subtle">{rotuloMes(m.mes, true)}</span>

          <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden w-max -translate-x-1/2 rounded-btn bg-[#101828] px-3 py-2 text-left text-meta text-white shadow-elevated group-hover:block">
            <div className="font-medium">{rotuloMes(m.mes)}</div>
            <div>{brl(m.gasto)}</div>
            <div className="text-[#C7D0DC]">{nf(m.litros, 2)} L</div>
            {typeof m.quantidade === "number" && (
              <div className="text-[#C7D0DC]">{m.quantidade} abastecimento(s)</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Ranking ──────────────────────────────────────────────────────────────────

function Ranking({ itens }: { itens: Dashboard["graficos"]["ranking_veiculos"] }) {
  if (itens.length === 0) {
    return (
      <EstadoVazio
        icone={Truck}
        titulo="Nenhum consumo registrado"
        descricao="Os veículos aparecerão aqui depois dos primeiros abastecimentos."
      />
    );
  }
  const maxLitros = Math.max(...itens.map((v) => v.litros), 1);
  return (
    <ol className="space-y-4">
      {itens.map((v, i) => (
        <li key={v.veiculo_id}>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-bg text-meta font-semibold text-text-body">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <Link href={`/veiculos/${v.veiculo_id}`} className="truncate text-body-sm font-medium text-text-title hover:text-[#1D5BD6] hover:underline">
                  {v.placa || "—"}
                </Link>
                <span className="shrink-0 text-body-sm font-semibold text-text-title tabular-nums">{nf(v.litros)} L</span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-meta text-text-subtle" title={v.modelo || undefined}>
                  {v.modelo || "Sem modelo"}
                </span>
                <span className="shrink-0 text-meta text-text-subtle tabular-nums">{brl(v.custo_combustivel)}</span>
              </div>
              <div className="text-meta text-text-subtle">
                Consumo médio:{" "}
                {v.consumo_medio_km_l != null ? (
                  <span className="tabular-nums text-text-body">{nf(v.consumo_medio_km_l, 1)} km/L</span>
                ) : (
                  <span title="Ainda não há histórico suficiente para calcular">— dados insuficientes</span>
                )}
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-bg">
                <div className="h-full rounded-full bg-[#1D5BD6]" style={{ width: `${Math.max((v.litros / maxLitros) * 100, 2)}%` }} />
              </div>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ── Atenção necessária ───────────────────────────────────────────────────────

type Alerta = {
  chave: string;
  icone: React.ElementType;
  cor: string;
  rotulo: string;
  texto: string;
  href: string;
  prioridade: number;
};

/**
 * Prioridade dos alertas (§16): ocorrências críticas → veículos indisponíveis →
 * estoque crítico → manutenção vencida → CNH vencida → documento vencido →
 * estoque baixo → manutenção próxima → documento a vencer.
 */
const P = {
  OCORRENCIA_CRITICA: 1,
  VEICULO_INDISPONIVEL: 2,
  ESTOQUE_CRITICO: 3,
  MANUTENCAO_VENCIDA: 4,
  CNH_VENCIDA: 5,
  DOC_VENCIDO: 6,
  ESTOQUE_BAIXO: 7,
  MANUTENCAO_PROXIMA: 8,
  DOC_A_VENCER: 9,
  CNH_A_VENCER: 9,
};

function montarAlertas(d: Dashboard): Alerta[] {
  const alertas: Alerta[] = [];

  if (d.ocorrencias_criticas > 0) {
    alertas.push({
      chave: "ocorrencias",
      icone: AlertTriangle,
      cor: "text-[#BA1A1A]",
      rotulo: "Crítico",
      texto: `${d.ocorrencias_criticas} ocorrência(s) grave(s) em aberto`,
      href: "/ocorrencias",
      prioridade: P.OCORRENCIA_CRITICA,
    });
  }

  if (d.frota.indisponiveis > 0) {
    alertas.push({
      chave: "indisponiveis",
      icone: CircleSlash,
      cor: "text-[#BA1A1A]",
      rotulo: "Frota",
      texto: `${d.frota.indisponiveis} veículo(s) indisponível(is)`,
      href: "/veiculos",
      prioridade: P.VEICULO_INDISPONIVEL,
    });
  }

  d.tanques
    .filter((t) => t.status_estoque !== "NORMAL")
    .forEach((t) =>
      alertas.push({
        chave: `tanque-${t.id}`,
        icone: Droplets,
        cor: t.status_estoque === "CRITICO" ? "text-[#BA1A1A]" : "text-[#805600]",
        rotulo: t.status_estoque === "CRITICO" ? "Estoque crítico" : "Estoque baixo",
        texto:
          t.status_estoque === "CRITICO"
            ? `${t.combustivel || t.nome} sem estoque disponível`
            : `${t.combustivel || t.nome} está abaixo do mínimo`,
        href: `/tanques/${t.id}`,
        prioridade: t.status_estoque === "CRITICO" ? P.ESTOQUE_CRITICO : P.ESTOQUE_BAIXO,
      })
    );

  d.proximas_preventivas
    .filter((p) => p.situacao === "VENCIDA" || p.situacao === "PROXIMA")
    .forEach((p) =>
      alertas.push({
        chave: `prev-${p.plano_id}`,
        icone: Wrench,
        cor: p.situacao === "VENCIDA" ? "text-[#BA1A1A]" : "text-[#805600]",
        rotulo: "Manutenção",
        texto: `${p.placa || "Veículo"} — ${p.nome} ${p.situacao === "VENCIDA" ? "vencida" : "próxima"}`,
        href: `/veiculos/${p.veiculo_id}`,
        prioridade: p.situacao === "VENCIDA" ? P.MANUTENCAO_VENCIDA : P.MANUTENCAO_PROXIMA,
      })
    );

  d.cnh_alertas.vencidas.forEach((m) =>
    alertas.push({
      chave: `cnh-v-${m.id}`,
      icone: Users,
      cor: "text-[#BA1A1A]",
      rotulo: "CNH",
      texto: `${m.nome} — CNH vencida`,
      href: `/motoristas/${m.id}`,
      prioridade: P.CNH_VENCIDA,
    })
  );
  d.cnh_alertas.vence_7.forEach((m) =>
    alertas.push({
      chave: `cnh-7-${m.id}`,
      icone: Users,
      cor: "text-[#805600]",
      rotulo: "CNH",
      texto: `${m.nome} — CNH vence em ${m.dias_restantes} dia(s)`,
      href: `/motoristas/${m.id}`,
      prioridade: P.CNH_A_VENCER,
    })
  );

  d.documentos_vencendo.forEach((doc) =>
    alertas.push({
      chave: `doc-${doc.id}`,
      icone: FileText,
      cor: doc.dias_restantes < 0 ? "text-[#BA1A1A]" : "text-[#805600]",
      rotulo: "Documento",
      texto:
        doc.dias_restantes < 0
          ? `${doc.placa || "Veículo"} — ${doc.descricao} vencido`
          : `${doc.placa || "Veículo"} — ${doc.descricao} vence em ${doc.dias_restantes} dia(s)`,
      href: `/veiculos/${doc.veiculo_id}`,
      prioridade: doc.dias_restantes < 0 ? P.DOC_VENCIDO : P.DOC_A_VENCER,
    })
  );

  return alertas.sort((a, b) => a.prioridade - b.prioridade);
}

// ── Erros ────────────────────────────────────────────────────────────────────

function ErroBloco({ onTentarNovamente }: { onTentarNovamente?: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-5 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-50 text-[#BA1A1A]">
        <AlertTriangle size={18} />
      </div>
      <p className="text-body-sm font-medium text-text-title">Não foi possível carregar estes dados.</p>
      {onTentarNovamente && (
        <button type="button" onClick={onTentarNovamente} className="btn btn-secondary btn-sm mt-1">
          <RefreshCw size={13} /> Tentar novamente
        </button>
      )}
    </div>
  );
}

/** Isola a falha de um bloco para que ela não derrube a dashboard inteira (§28). */
class BlocoSeguro extends Component<{ children: ReactNode; onTentarNovamente?: () => void }, { falhou: boolean }> {
  state = { falhou: false };

  static getDerivedStateFromError() {
    return { falhou: true };
  }

  render() {
    if (this.state.falhou) {
      return (
        <ErroBloco
          onTentarNovamente={
            this.props.onTentarNovamente
              ? () => {
                  this.setState({ falhou: false });
                  this.props.onTentarNovamente?.();
                }
              : undefined
          }
        />
      );
    }
    return this.props.children;
  }
}

function ErroTotal({ mensagem, onRecarregar }: { mensagem: string; onRecarregar: () => void }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-card border border-surface-border bg-white px-6 py-12 text-center shadow-card">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-[#BA1A1A]">
        <AlertTriangle size={22} />
      </div>
      <h1 className="text-h3 text-text-title">Não foi possível carregar a dashboard</h1>
      <p className="text-body-sm text-text-subtle">Tente novamente em alguns instantes.</p>
      <button type="button" onClick={onRecarregar} className="btn btn-primary btn-sm">
        <RefreshCw size={14} /> Recarregar
      </button>
      <p className="text-meta text-text-subtle">{mensagem}</p>
    </div>
  );
}

// ── Onboarding da organização nova ───────────────────────────────────────────

function Onboarding({ estado }: { estado: Dashboard["onboarding"] }) {
  const passos = [
    { chave: "veiculos", titulo: "Cadastre os veículos", acao: "Cadastrar veículo", href: "/veiculos", pronto: estado.veiculos > 0 },
    { chave: "motoristas", titulo: "Cadastre os motoristas", acao: "Cadastrar motorista", href: "/motoristas", pronto: estado.motoristas > 0 },
    { chave: "tanques", titulo: "Cadastre os tanques", acao: "Cadastrar tanque", href: "/tanques", pronto: estado.tanques > 0 },
    { chave: "entradas", titulo: "Registre uma entrada de combustível", acao: "Registrar entrada", href: "/tanques", pronto: estado.entradas > 0 },
  ];
  return (
    <section className="rounded-card border border-[#BFDBFE] bg-[#EFF6FF] p-5">
      <h2 className="text-h3 text-text-title">Comece a configurar sua frota</h2>
      <p className="mt-0.5 text-body-sm text-text-body">
        Configure os dados básicos para começar a controlar veículos, combustível e manutenções.
      </p>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {passos.map((passo, i) => (
          <li key={passo.chave} className="flex flex-col gap-2 rounded-card border border-surface-border bg-white p-4">
            <div className="flex items-start gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#EFF6FF] text-meta font-semibold text-[#1D5BD6]">
                {passo.pronto ? <CheckCircle2 size={14} className="text-[#106D34]" aria-label="Concluído" /> : i + 1}
              </span>
              <span className="text-body-sm font-medium text-text-title">{passo.titulo}</span>
            </div>
            <Link href={passo.href} className="btn btn-secondary btn-sm mt-auto self-start">
              {passo.acao}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ── Ações rápidas com pré-requisitos ─────────────────────────────────────────

type Pendencia = { mensagem: string; acao: string; href: string } | null;

function pendenciaDaAcao(chave: string, o: Dashboard["onboarding"]): Pendencia {
  if (chave === "abastecimento") {
    if (o.veiculos === 0)
      return { mensagem: "Cadastre um veículo antes de registrar um abastecimento.", acao: "Cadastrar veículo", href: "/veiculos" };
    if (o.tanques === 0)
      return {
        mensagem: "Cadastre um tanque de combustível antes de registrar um abastecimento interno.",
        acao: "Cadastrar tanque",
        href: "/tanques",
      };
  }
  if (chave === "entrada" && o.tanques === 0)
    return { mensagem: "Cadastre um tanque antes de registrar uma entrada de combustível.", acao: "Cadastrar tanque", href: "/tanques" };
  if (chave === "manutencao" && o.veiculos === 0)
    return { mensagem: "Cadastre um veículo antes de registrar uma manutenção.", acao: "Cadastrar veículo", href: "/veiculos" };
  return null;
}

function DialogoPreRequisito({ pendencia, onFechar }: { pendencia: Pendencia; onFechar: () => void }) {
  useEffect(() => {
    if (!pendencia) return;
    const fechar = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [pendencia, onFechar]);

  if (!pendencia) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="pre-req-titulo">
      <div className="absolute inset-0 bg-black/30" onClick={onFechar} />
      <div className="relative w-full max-w-sm rounded-card bg-white p-5 shadow-elevated">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-btn bg-orange-50 text-[#805600]">
            <ClipboardCheck size={17} />
          </span>
          <p id="pre-req-titulo" className="text-body-sm text-text-title">
            {pendencia.mensagem}
          </p>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onFechar} className="btn btn-ghost btn-sm">
            Cancelar
          </button>
          <Link href={pendencia.href} className="btn btn-primary btn-sm" onClick={onFechar}>
            {pendencia.acao}
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="skeleton h-8 w-64" />
          <div className="skeleton h-4 w-80" />
        </div>
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-10 w-40" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton h-[124px] rounded-card" />
        ))}
      </div>
      <div className="skeleton h-[76px] rounded-card" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-[190px] rounded-card" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="skeleton h-[340px] rounded-card" />
        <div className="skeleton h-[340px] rounded-card" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="skeleton h-[280px] rounded-card" />
        <div className="skeleton h-[280px] rounded-card" />
      </div>
    </div>
  );
}

// ── Página ───────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { hasPermission, user } = useAuth();
  const [dados, setDados] = useState<Dashboard | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [pendencia, setPendencia] = useState<Pendencia>(null);
  const primeiraCarga = useRef(true);

  const carregar = useCallback(async (silencioso = false) => {
    setCarregando(true);
    try {
      const novos = await api.dashboard();
      // Revalidação nunca desmonta a tela: os dados só são trocados no sucesso.
      setDados(novos);
      setAtualizadoEm(new Date());
      setErro(null);
    } catch (e) {
      const msg = (e as Error).message;
      setErro(msg);
      if (!silencioso) toast.error(msg);
    } finally {
      setCarregando(false);
      primeiraCarga.current = false;
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Revalida ao voltar para a aba, mantendo os dados atuais na tela.
  useEffect(() => {
    const aoFocar = () => carregar(true);
    window.addEventListener("focus", aoFocar);
    return () => window.removeEventListener("focus", aoFocar);
  }, [carregar]);

  if (erro && !dados) return <ErroTotal mensagem={erro} onRecarregar={() => carregar()} />;
  if (!dados) return <Skeleton />;

  const organizacao = dados.organizacao?.nome || user?.organization_name || null;
  const alertas = montarAlertas(dados);
  const preventivas = dados.proximas_preventivas;
  const onboarding = dados.onboarding;
  const horaAtualizacao = (atualizadoEm ?? new Date(dados.atualizado_em)).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const acoes = [
    { chave: "abastecimento", href: "/abastecimentos", label: "Abastecimento", perm: "refueling.manage", primaria: true },
    { chave: "entrada", href: "/tanques", label: "Entrada de combustível", perm: "fuel.manage" },
    { chave: "manutencao", href: "/manutencoes", label: "Manutenção", perm: "maintenance.manage" },
  ].filter((a) => hasPermission(a.perm));

  return (
    <div className="grid min-w-0 grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      {/* Cabeçalho */}
      <header className="order-1 flex flex-col gap-4 md:flex-row md:items-start md:justify-between xl:col-span-2">
        <div className="min-w-0">
          <h2 className="text-3xl font-bold text-[#181C22]">Visão geral da frota</h2>
          {organizacao && (
            <p className="mt-2 text-sm font-medium text-[#181C22]" title={organizacao}>
              {organizacao}
            </p>
          )}
          <p className="mt-2 text-sm text-[#737781]">Acompanhe veículos, abastecimentos, combustível e manutenções.</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-[#737781]" aria-live="polite">
            <RefreshCw size={12} className={carregando ? "animate-spin" : ""} aria-hidden />
            {carregando ? "Atualizando dados…" : `Dados atualizados às ${horaAtualizacao}`}
            {!carregando && (
              <button
                type="button"
                onClick={() => carregar(true)}
                className="ring-focus rounded text-[#1D5BD6] hover:underline"
                aria-label="Atualizar dados da dashboard"
              >
                Atualizar
              </button>
            )}
          </p>
        </div>
        {acoes.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            {acoes.map((a) => {
              const bloqueio = pendenciaDaAcao(a.chave, onboarding);
              const classe = a.primaria ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm";
              return bloqueio ? (
                <button key={a.chave} type="button" className={classe} onClick={() => setPendencia(bloqueio)}>
                  <Plus size={14} aria-hidden /> {a.label}
                </button>
              ) : (
                <Link key={a.chave} href={a.href} className={classe}>
                  <Plus size={14} aria-hidden /> {a.label}
                </Link>
              );
            })}
          </div>
        )}
      </header>

      {onboarding.pendente && (
        <div className="order-2 xl:col-span-2">
          <Onboarding estado={onboarding} />
        </div>
      )}

      {/* Indicadores principais */}
      <div className="order-2 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5 xl:col-span-2">
        <CardPrincipal titulo="Total de veículos" valor={nf(dados.frota.total)} icone={Truck} cor="bg-[#D9E2FF] text-[#1D5BD6]" href="/veiculos" />
        <CardPrincipal
          titulo="Disponíveis"
          valor={nf(dados.frota.disponiveis)}
          sub={dados.frota.total > 0 ? `${Math.round((dados.frota.disponiveis / dados.frota.total) * 100)}% da frota` : undefined}
          icone={Truck}
          cor="bg-[#9DF6B3] text-[#106D34]"
          href="/veiculos"
        />
        <CardPrincipal
          titulo="Em manutenção"
          valor={nf(dados.frota.em_manutencao)}
          sub={`${dados.manutencao.abertas} ordem(ns) aberta(s)`}
          icone={Wrench}
          cor="bg-[#FFDD9A] text-[#805600]"
          href="/manutencoes"
        />
        <CardPrincipal
          titulo="Litros no mês"
          valor={`${nf(dados.abastecimentos.mes_litros)} L`}
          sub={`${nf(dados.abastecimentos.hoje_litros, 1)} L hoje`}
          icone={Fuel}
          cor="bg-[#D9E2FF] text-[#1D5BD6]"
          href="/abastecimentos"
        />
        <CardPrincipal
          titulo="Gasto no mês"
          valor={brl(dados.abastecimentos.mes_gasto)}
          sub={`${nf(dados.abastecimentos.mes_quantidade)} abastecimento(s)`}
          icone={TrendingUp}
          cor="bg-[#D9E2FF] text-[#1D5BD6]"
          href="/relatorios"
        />
      </div>

      {/* Situação operacional */}
      <section className="order-3 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6 xl:col-span-2">
        <Indicador titulo="Em uso" valor={dados.frota.em_uso} icone={Gauge} cor="bg-[#D9E2FF] text-[#1D5BD6]" href="/veiculos" />
        <Indicador titulo="Indisponíveis" valor={dados.frota.indisponiveis} icone={CircleSlash} cor="bg-[#FFDAD6] text-[#BA1A1A]" href="/veiculos" alerta />
        <Indicador titulo="Manutenções abertas" valor={dados.manutencao.abertas} icone={ClipboardList} cor="bg-[#FFDD9A] text-[#805600]" href="/manutencoes" />
        <Indicador titulo="Ocorrências críticas" valor={dados.ocorrencias_criticas} icone={AlertTriangle} cor="bg-[#FFDAD6] text-[#BA1A1A]" href="/ocorrencias" alerta />
        <Indicador titulo="Preventivas próximas" valor={dados.manutencao.preventivas_proximas} icone={CalendarClock} cor="bg-[#D9E2FF] text-[#1D5BD6]" href="/manutencoes" />
        <Indicador titulo="Preventivas vencidas" valor={dados.manutencao.preventivas_vencidas} icone={Wrench} cor="bg-[#FFDD9A] text-[#805600]" href="/manutencoes" alerta />
      </section>

      {/* Estoque de combustíveis */}
      {hasPermission("refueling.view") && (
        <section className="order-5 space-y-3 xl:order-4 xl:col-span-2">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-h3 text-text-title">Estoque de combustíveis</h2>
              <p className="text-meta text-text-subtle">Nível atual de cada tanque</p>
            </div>
            <VerTodos href="/tanques" label="Gerenciar tanques" />
          </div>
          {dados.tanques.length === 0 ? (
            <div className="rounded-card border border-surface-border bg-white shadow-card">
              <EstadoVazio
                icone={Droplets}
                titulo="Nenhum tanque cadastrado"
                descricao="Cadastre os tanques para acompanhar o estoque de combustível em tempo real."
                acao={
                  <Link href="/tanques" className="btn btn-secondary btn-sm mt-1">
                    Cadastrar tanque
                  </Link>
                }
              />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {dados.tanques.map((t) => (
                <CardTanque key={t.id} tanque={t} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Gastos + ranking */}
        <Bloco className="order-7 xl:order-5" titulo="Gasto mensal com combustível" descricao="Últimos 6 meses" acao={<VerTodos href="/relatorios" label="Relatórios" />}>
          <BlocoSeguro onTentarNovamente={() => carregar()}>
            <GraficoGastos dados={dados.graficos.evolucao_mensal} />
          </BlocoSeguro>
        </Bloco>
        <Bloco className="order-8 xl:order-6" titulo="Veículos que mais consomem" descricao="Últimos 90 dias" acao={<VerTodos href="/relatorios" />}>
          <BlocoSeguro onTentarNovamente={() => carregar()}>
            <Ranking itens={dados.graficos.ranking_veiculos} />
          </BlocoSeguro>
        </Bloco>

      {/* Últimos abastecimentos + atenção */}
        <Bloco className="order-6 xl:order-7" titulo="Últimos abastecimentos" descricao="Registros mais recentes" acao={<VerTodos href="/abastecimentos" />}>
          {dados.ultimos_abastecimentos.length === 0 ? (
            <EstadoVazio
              icone={Fuel}
              titulo="Nenhum abastecimento registrado"
              descricao="Os lançamentos do painel e do app do motorista aparecerão aqui."
              acao={
                <Link href="/abastecimentos" className="btn btn-secondary btn-sm mt-1">
                  Registrar abastecimento
                </Link>
              }
            />
          ) : (
            <>
              {/* Desktop: tabela compacta */}
              <div className="-mx-1 hidden overflow-x-auto px-1 sm:block">
                <table className="w-full text-body-sm">
                  <thead>
                    <tr className="border-b border-surface-border text-left text-meta uppercase tracking-wide text-text-subtle">
                      <th className="pb-2 pl-1 font-medium">Data</th>
                      <th className="pb-2 font-medium">Veículo</th>
                      <th className="pb-2 font-medium">Motorista</th>
                      <th className="hidden pb-2 font-medium 2xl:table-cell">Combustível</th>
                      <th className="pb-2 text-right font-medium">Litros</th>
                      <th className="pb-2 pr-1 text-right font-medium">KM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.ultimos_abastecimentos.map((a) => (
                      <tr key={a.id} className="border-b border-surface-border last:border-0">
                        <td className="whitespace-nowrap py-2.5 pl-1 text-meta text-text-subtle" title={dataCompleta(a.data)}>
                          {dataHumana(a.data)}
                        </td>
                        <td className="max-w-[13rem] py-2.5">
                          <Link
                            href={`/veiculos/${a.veiculo_id}`}
                            className="ring-focus rounded font-medium text-text-title hover:text-[#1D5BD6] hover:underline"
                          >
                            {a.placa || "—"}
                          </Link>
                          <div className="truncate text-meta text-text-subtle" title={a.modelo || undefined}>
                            {a.modelo || ""}
                          </div>
                        </td>
                        <td className="max-w-[9rem] truncate py-2.5 text-text-body" title={a.motorista || undefined}>
                          {a.motorista || "—"}
                        </td>
                        <td className="hidden max-w-[9rem] truncate py-2.5 text-text-body 2xl:table-cell">{a.combustivel || "—"}</td>
                        <td className="whitespace-nowrap py-2.5 pl-2 text-right font-medium text-text-title tabular-nums">{nf(a.litros, 2)} L</td>
                        <td className="whitespace-nowrap py-2.5 pr-1 text-right text-text-body tabular-nums">{nf(a.quilometragem)} km</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile: lista */}
              <ul className="divide-y divide-surface-border sm:hidden">
                {dados.ultimos_abastecimentos.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="text-body-sm font-medium text-text-title">{a.placa || "—"}</div>
                      <div className="truncate text-meta text-text-subtle">{[a.modelo, a.motorista].filter(Boolean).join(" • ") || "—"}</div>
                      <div className="text-meta text-text-subtle">{dataHumana(a.data)}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-body-sm font-semibold text-text-title tabular-nums">{nf(a.litros, 2)} L</div>
                      <div className="text-meta text-text-subtle">{a.combustivel || ""}</div>
                      <div className="text-meta text-text-subtle tabular-nums">{nf(a.quilometragem)} km</div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Bloco>

        <Bloco className="order-4 xl:order-8" titulo="Atenção necessária" descricao="Pendências que exigem ação" acao={alertas.length > 0 ? <VerTodos href="/notificacoes" label="Ver todos os alertas" /> : undefined}>
          {alertas.length === 0 ? (
            <EstadoVazio icone={AlertTriangle} titulo="Nenhuma pendência" descricao="Estoque, documentos, CNHs e manutenções estão em dia." />
          ) : (
            <ul className="space-y-1">
              {alertas.slice(0, 5).map((a) => {
                const Icone = a.icone;
                return (
                  <li key={a.chave}>
                    <Link href={a.href} className="ring-focus -mx-2 flex items-start gap-2.5 rounded-btn px-2 py-2 transition-colors hover:bg-surface-bg">
                      <Icone size={16} className={`mt-0.5 shrink-0 ${a.cor}`} aria-hidden />
                      <span className="min-w-0 text-body-sm text-text-body">
                        <span className={`mr-1 font-medium ${a.cor}`}>{a.rotulo}</span>
                        <span className="text-text-body">{a.texto}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
              {alertas.length > 5 && (
                <li className="pt-1 text-meta text-text-subtle">+ {alertas.length - 5} outra(s) pendência(s)</li>
              )}
            </ul>
          )}
        </Bloco>

      {/* Próximas manutenções preventivas */}
      {hasPermission("maintenance.view") && (
        <Bloco className="order-9 xl:col-span-2" titulo="Próximas manutenções preventivas" descricao="Planos por quilometragem e por prazo" acao={<VerTodos href="/manutencoes" />}>
          {preventivas.length === 0 ? (
            <EstadoVazio
              icone={Wrench}
              titulo="Nenhum plano preventivo ativo"
              descricao="Cadastre planos preventivos para antecipar trocas de óleo e revisões."
              acao={
                <Link href="/manutencoes" className="btn btn-secondary btn-sm mt-1">
                  Criar plano preventivo
                </Link>
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {preventivas.map((p) => {
                const vencida = p.situacao === "VENCIDA";
                const proxima = p.situacao === "PROXIMA";
                const previsao =
                  p.restante_km !== null
                    ? vencida
                      ? `${nf(Math.abs(p.restante_km))} km em atraso`
                      : `faltam ${nf(p.restante_km)} km`
                    : p.restante_dias !== null
                    ? vencida
                      ? `vencida há ${Math.abs(p.restante_dias)} dia(s)`
                      : `vence em ${p.restante_dias} dia(s)`
                    : "—";
                return (
                  <Link
                    key={p.plano_id}
                    href={`/veiculos/${p.veiculo_id}`}
                    className="ring-focus flex min-w-0 items-start justify-between gap-3 rounded-card border border-surface-border p-4 transition-colors hover:bg-surface-bg"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-body-sm font-medium text-text-title" title={`${p.modelo || "Veículo"} ${p.placa || ""}`}>
                        {p.modelo || "Veículo"} {p.placa ? `· ${p.placa}` : ""}
                      </div>
                      <div className="truncate text-meta text-text-subtle">{p.nome}</div>
                      <div className={`mt-1 text-meta font-medium ${vencida ? "text-[#BA1A1A]" : proxima ? "text-[#805600]" : "text-text-body"}`}>
                        {previsao}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-pill px-2 py-0.5 text-meta font-medium ${
                        vencida ? "bg-red-50 text-[#BA1A1A]" : proxima ? "bg-orange-50 text-[#805600]" : "bg-green-50 text-[#106D34]"
                      }`}
                    >
                      {vencida ? "Vencida" : proxima ? "Próxima" : "Em dia"}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </Bloco>
      )}

      <DialogoPreRequisito pendencia={pendencia} onFechar={() => setPendencia(null)} />
    </div>
  );
}
