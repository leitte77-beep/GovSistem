"use client";

/**
 * Blocos dos painéis: KPI, seção, barras horizontais, rosca, lista de
 * parados, feed ao vivo e cartão de obra. Tudo em CSS/SVG — nada de
 * biblioteca de gráfico: o painel do Prefeito abre rápido no 4G.
 */

import clsx from "clsx";
import {
  ArrowUpRight,
  CheckCircle2,
  CornerUpLeft,
  FileText,
  HardHat,
  Hourglass,
  MessageSquare,
  PauseCircle,
  Send,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { EtiquetaMotivo, EtiquetaParado, EtiquetaSituacao } from "@/components/Etiquetas";
import { api, type EventoRecente, type Fatia, type ObraResumo, type PedidoLinha } from "@/lib/api";
import { ROTULO_MOTIVO_PARADA, moedaCurta, ondeEsta, relativo } from "@/lib/formato";
import { useNomeSetor } from "@/lib/setores";

// ── KPI ─────────────────────────────────────────────────────────────────

export type TomKpi = "marca" | "alerta" | "atencao" | "ok" | "neutro" | "info";

const TOM: Record<TomKpi, { icone: string; valor: string }> = {
  marca: { icone: "bg-brand-50 text-brand", valor: "text-ink" },
  alerta: { icone: "bg-estado-atrasado/10 text-estado-atrasado", valor: "text-estado-atrasado" },
  atencao: { icone: "bg-brass-50 text-brass-700", valor: "text-ink" },
  ok: { icone: "bg-estado-concluido/10 text-estado-concluido", valor: "text-ink" },
  neutro: { icone: "bg-ink/[.05] text-ink-muted", valor: "text-ink" },
  info: { icone: "bg-estado-info/10 text-estado-info", valor: "text-ink" },
};

export function Kpi({
  rotulo,
  valor,
  detalhe,
  icone: Icone,
  tom = "neutro",
  href,
}: {
  rotulo: string;
  valor: string | number;
  detalhe?: string;
  icone: LucideIcon;
  tom?: TomKpi;
  href?: string;
}) {
  const corpo = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className={clsx("grid h-10 w-10 place-items-center rounded-xl", TOM[tom].icone)}>
          <Icone size={19} aria-hidden />
        </span>
        {href && (
          <ArrowUpRight
            size={16}
            className="text-ink-faint transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-brand"
            aria-hidden
          />
        )}
      </div>
      <p className={clsx("mt-4 font-display text-[28px] font-medium leading-none tabular-nums sm:text-[32px]", TOM[tom].valor)}>
        {valor}
      </p>
      <p className="mt-1.5 text-sm font-medium text-ink-soft">{rotulo}</p>
      {detalhe && <p className="mt-0.5 text-xs text-ink-muted">{detalhe}</p>}
    </>
  );
  const classe = "group cartao block p-4 sm:p-5";
  return href ? (
    <Link href={href} className={clsx(classe, "transition hover:border-line-strong hover:shadow-pop")}>
      {corpo}
    </Link>
  ) : (
    <div className={classe}>{corpo}</div>
  );
}

// ── Seção ───────────────────────────────────────────────────────────────

export function Secao({
  titulo,
  subtitulo,
  acao,
  children,
  className,
  semPadding,
}: {
  titulo: string;
  subtitulo?: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  semPadding?: boolean;
}) {
  return (
    <section className={clsx("cartao overflow-hidden", className)}>
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h2 className="font-display text-[17px] font-medium text-ink">{titulo}</h2>
          {subtitulo && <p className="mt-0.5 text-xs text-ink-muted">{subtitulo}</p>}
        </div>
        {acao}
      </header>
      <div className={semPadding ? "" : "p-4 sm:p-5"}>{children}</div>
    </section>
  );
}

export function Vazio({ texto, icone: Icone = Sparkles }: { texto: string; icone?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-full bg-estado-concluido/10 text-estado-concluido">
        <Icone size={20} aria-hidden />
      </span>
      <p className="text-sm text-ink-muted">{texto}</p>
    </div>
  );
}

export function EsqueletoPainel() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando">
      <div className="esqueleto h-9 w-72" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="esqueleto h-36 rounded-card" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="esqueleto h-80 rounded-card lg:col-span-2" />
        <div className="esqueleto h-80 rounded-card" />
      </div>
    </div>
  );
}

// ── Barras horizontais ──────────────────────────────────────────────────

export function Barras({
  itens,
  formatar = (n) => String(n),
  cor = "bg-brand",
  hrefDe,
}: {
  itens: { chave: string; rotulo: string; valor: number; extra?: string; alerta?: boolean }[];
  formatar?: (n: number) => string;
  cor?: string;
  hrefDe?: (chave: string) => string;
}) {
  const max = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <ul className="space-y-3">
      {itens.map((i) => {
        const linha = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-ink-soft">{i.rotulo}</span>
              <span className={clsx("shrink-0 font-medium tabular-nums", i.alerta ? "text-estado-atrasado" : "text-ink")}>
                {formatar(i.valor)}
                {i.extra && <span className="ml-1.5 text-xs font-normal text-ink-muted">{i.extra}</span>}
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-pill bg-ink/[.06]">
              <div
                className={clsx("h-full rounded-pill transition-[width] duration-700 ease-out", i.alerta ? "bg-estado-atrasado" : cor)}
                style={{ width: `${Math.max(3, (i.valor / max) * 100)}%` }}
              />
            </div>
          </>
        );
        return (
          <li key={i.chave}>
            {hrefDe ? (
              <Link href={hrefDe(i.chave)} className="block rounded-btn -mx-2 px-2 py-1 transition hover:bg-canvas">
                {linha}
              </Link>
            ) : (
              linha
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ── Rosca ───────────────────────────────────────────────────────────────

const CORES_ROSCA = [
  "rgb(var(--c-brand))",
  "rgb(var(--c-brass))",
  "rgb(var(--c-info))",
  "rgb(var(--c-externo))",
  "rgb(var(--c-atrasado))",
  "rgb(var(--c-concluido))",
];

export function Rosca({ fatias, centro }: { fatias: Fatia[]; centro?: string }) {
  const total = fatias.reduce((s, f) => s + f.quantidade, 0);
  const r = 42;
  const c = 2 * Math.PI * r;
  let acumulado = 0;
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 100 100" className="h-32 w-32 shrink-0 -rotate-90" role="img" aria-label="Distribuição">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(var(--c-ink) / .06)" strokeWidth="12" />
        {total > 0 &&
          fatias.map((f, i) => {
            const parte = (f.quantidade / total) * c;
            const el = (
              <circle
                key={f.chave}
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke={CORES_ROSCA[i % CORES_ROSCA.length]}
                strokeWidth="12"
                strokeDasharray={`${Math.max(0, parte - 1.2)} ${c}`}
                strokeDashoffset={-acumulado}
                className="transition-all duration-700"
              />
            );
            acumulado += parte;
            return el;
          })}
        <text
          x="50"
          y="50"
          textAnchor="middle"
          dominantBaseline="central"
          className="rotate-90 fill-ink font-display text-[20px]"
          style={{ transformOrigin: "50px 50px" }}
        >
          {centro ?? total}
        </text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-2 text-sm">
        {fatias.map((f, i) => (
          <li key={f.chave} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CORES_ROSCA[i % CORES_ROSCA.length] }} />
            <span className="truncate text-ink-soft">{f.rotulo}</span>
            <span className="ml-auto font-medium tabular-nums text-ink">{f.quantidade}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Onde está travado ───────────────────────────────────────────────────

export function ListaParados({
  pedidos,
  limite,
  vazio = "Nada parado. Tudo andando.",
}: {
  pedidos: PedidoLinha[];
  limite: number;
  vazio?: string;
}) {
  const nomeSetor = useNomeSetor();
  if (pedidos.length === 0) return <Vazio texto={vazio} icone={CheckCircle2} />;
  return (
    <ul className="divide-y divide-line">
      {pedidos.map((p) => {
        const critico = p.dias_na_situacao >= limite;
        return (
          <li key={p.id}>
            <Link
              href={`/pedidos/${p.id}`}
              className="group flex items-stretch gap-3 px-4 py-3.5 transition hover:bg-canvas sm:px-5"
            >
              <span
                className={clsx(
                  "w-1 shrink-0 rounded-pill",
                  critico ? "bg-estado-atrasado" : p.dias_na_situacao >= limite / 2 ? "bg-brass" : "bg-line-strong"
                )}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="numero">{p.numero}</span>
                  {p.tipo === "OBRA" && <HardHat size={13} className="text-ink-faint" aria-hidden />}
                </span>
                <span className="mt-0.5 block truncate text-[15px] font-medium text-ink group-hover:text-brand">
                  {p.titulo}
                </span>
                <span className="mt-1 block text-sm text-ink-muted">
                  <span className="font-medium text-ink-soft">
                    {ondeEsta(p.situacao, p.setor_atual, nomeSetor)}
                  </span>
                  {p.motivo_parada && (
                    <>
                      {" · "}
                      {ROTULO_MOTIVO_PARADA[p.motivo_parada]}
                      {p.motivo_parada_texto && (
                        <span className="text-ink-faint"> — {p.motivo_parada_texto}</span>
                      )}
                    </>
                  )}
                  {!p.motivo_parada && p.situacao !== "COM_ASSESSOR" && p.tarefa_atual && (
                    <span className="text-ink-faint"> · {p.tarefa_atual}</span>
                  )}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end justify-center gap-1 text-right">
                <span
                  className={clsx(
                    "font-display text-2xl leading-none tabular-nums",
                    critico ? "text-estado-atrasado" : "text-ink"
                  )}
                >
                  {p.dias_na_situacao}
                </span>
                <span className="text-[11px] text-ink-faint">{p.dias_na_situacao === 1 ? "dia" : "dias"}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// ── Linha compacta de pedido (listas do Assessor/Departamento) ──────────

export function LinhaPedido({
  p,
  limite,
  mostrarOnde = true,
  lado,
}: {
  p: PedidoLinha;
  limite: number;
  mostrarOnde?: boolean;
  lado?: React.ReactNode;
}) {
  const nomeSetor = useNomeSetor();
  return (
    <Link
      href={`/pedidos/${p.id}`}
      className="group flex items-center gap-3 px-4 py-3 transition hover:bg-canvas sm:px-5"
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2">
          <span className="numero">{p.numero}</span>
          {p.prioridade !== "NORMAL" && (
            <span
              className={clsx(
                "text-[10px] font-semibold uppercase tracking-wider",
                p.prioridade === "URGENTE" ? "text-estado-atrasado" : "text-brass-700"
              )}
            >
              {p.prioridade === "URGENTE" ? "Urgente" : "Alta"}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-sm font-medium text-ink group-hover:text-brand">
          {p.titulo}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          {mostrarOnde && p.situacao === "EM_SETOR" && (
            <span className="text-xs text-ink-muted">{nomeSetor(p.setor_atual)}</span>
          )}
          {p.tarefa_atual && (
            <span className="truncate text-xs text-ink-faint">· {p.tarefa_atual}</span>
          )}
          <EtiquetaMotivo motivo={p.motivo_parada} />
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        {lado ?? <EtiquetaParado dias={p.dias_na_situacao} limite={limite} compacta />}
        {p.dias_de_atraso > 0 && (
          <span className="text-[11px] font-medium text-estado-atrasado">
            {p.dias_de_atraso}d atrasado
          </span>
        )}
      </span>
    </Link>
  );
}

// ── Feed ao vivo ────────────────────────────────────────────────────────

export const ICONE_EVENTO: Record<string, LucideIcon> = {
  ENCAMINHAMENTO: Send,
  DEVOLUCAO: CornerUpLeft,
  ANEXO: FileText,
  COMENTARIO: MessageSquare,
  PARADA: PauseCircle,
  TERCEIRO: Hourglass,
  CONCLUSAO: CheckCircle2,
  MEDICAO: HardHat,
};

export function Feed({ eventos }: { eventos: EventoRecente[] }) {
  const nomeSetor = useNomeSetor();
  if (eventos.length === 0) return <Vazio texto="Nenhuma movimentação ainda." />;
  return (
    <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-line">
      {eventos.map((e, i) => {
        const Icone = ICONE_EVENTO[e.tipo] ?? Sparkles;
        return (
          <li key={`${e.pedido_id}-${e.created_at}-${i}`} className="relative flex gap-3">
            <span className="relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-paper text-ink-muted">
              <Icone size={14} aria-hidden />
            </span>
            <Link href={`/pedidos/${e.pedido_id}`} className="group min-w-0 flex-1 pt-0.5">
              <p className="truncate text-sm font-medium text-ink">
                {e.autor_nome}
                {e.setor && <span className="font-normal text-ink-muted"> · {nomeSetor(e.setor)}</span>}
              </p>
              <p className="truncate text-sm leading-snug text-ink-soft" title={e.texto ?? ""}>
                {e.texto}
              </p>
              <p className="mt-0.5 truncate text-xs text-ink-faint group-hover:text-brand">
                {e.numero}
                {e.tarefa ? ` · ${e.tarefa}` : ` · ${e.titulo}`} · {relativo(e.created_at)}
              </p>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

// ── Obra ────────────────────────────────────────────────────────────────

function FotoObra({ pedidoId, fotoId }: { pedidoId: string; fotoId: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!fotoId) return;
    let criada: string | null = null;
    api
      .urlDaFoto(pedidoId, fotoId)
      .then((u) => {
        criada = u;
        setUrl(u);
      })
      .catch(() => setUrl(null));
    return () => {
      if (criada) URL.revokeObjectURL(criada);
    };
  }, [pedidoId, fotoId]);
  if (!url) {
    return (
      <div className="grid h-full w-full place-items-center bg-gradient-to-br from-brand-50 to-brass-50">
        <HardHat size={28} className="text-brand/40" aria-hidden />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" className="h-full w-full object-cover" />;
}

export function CartaoObra({ obra, limite }: { obra: ObraResumo; limite: number }) {
  const nomeSetor = useNomeSetor();
  const pct = obra.percentual_executado ? Number(obra.percentual_executado) : null;
  return (
    <Link
      href={`/pedidos/${obra.id}`}
      className="group cartao flex overflow-hidden transition hover:border-line-strong hover:shadow-pop"
    >
      <div className="h-auto w-24 shrink-0 overflow-hidden sm:w-28">
        <FotoObra pedidoId={obra.id} fotoId={obra.foto_id} />
      </div>
      <div className="min-w-0 flex-1 p-3.5">
        <span className="numero">{obra.numero}</span>
        <p className="truncate text-sm font-medium text-ink group-hover:text-brand">{obra.titulo}</p>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-pill bg-ink/[.06]">
            <div
              className="h-full rounded-pill bg-gradient-to-r from-brand to-estado-concluido transition-[width] duration-700"
              style={{ width: `${pct ?? 0}%` }}
            />
          </div>
          <span className="w-10 text-right text-xs font-semibold tabular-nums text-ink">
            {pct === null ? "—" : `${Math.round(pct)}%`}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <EtiquetaSituacao situacao={obra.situacao} />
          {obra.situacao === "EM_SETOR" && (
            <span className="text-xs text-ink-muted">{nomeSetor(obra.setor_atual)}</span>
          )}
          <EtiquetaParado dias={obra.dias_na_situacao} limite={limite} compacta />
        </div>
        {obra.valor_previsto && (
          <p className="mt-1.5 text-xs text-ink-muted">
            {moedaCurta(obra.valor_pago)} pagos de {moedaCurta(obra.valor_previsto)}
          </p>
        )}
      </div>
    </Link>
  );
}
