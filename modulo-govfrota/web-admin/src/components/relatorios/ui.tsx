"use client";

/** Peças visuais comuns a todos os relatórios: indicadores, filtros, tabela, estados. */

import type { ReactNode } from "react";
import { ChevronDown, Inbox, SlidersHorizontal, X, type LucideIcon } from "lucide-react";

export type Tom = "azul" | "verde" | "ambar" | "vermelho" | "roxo" | "cinza";

const TONS: Record<Tom, { icone: string; faixa: string }> = {
  azul: { icone: "bg-[#EFF4FF] text-[#1D4ED8]", faixa: "from-[#1D4ED8] to-[#3B82F6]" },
  verde: { icone: "bg-[#E7F8EC] text-[#106D34]", faixa: "from-[#106D34] to-[#22C55E]" },
  ambar: { icone: "bg-[#FFF4D6] text-[#B54708]", faixa: "from-[#B54708] to-[#F59E0B]" },
  vermelho: { icone: "bg-[#FEE4E2] text-[#B42318]", faixa: "from-[#B42318] to-[#F04438]" },
  roxo: { icone: "bg-[#F4F3FF] text-[#5925DC]", faixa: "from-[#5925DC] to-[#7A5AF8]" },
  cinza: { icone: "bg-[#F2F4F7] text-[#475467]", faixa: "from-[#475467] to-[#98A2B3]" },
};

/** Variação percentual entre dois valores; null quando não há base de comparação. */
export function variacao(atual: number | null | undefined, anterior: number | null | undefined): number | null {
  if (atual == null || anterior == null || anterior === 0) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

export function Kpi({ rotulo, valor, Icone, tom = "azul", detalhe, delta, menorMelhor = true, destaque }: {
  rotulo: string;
  valor: ReactNode;
  Icone: LucideIcon;
  tom?: Tom;
  detalhe?: ReactNode;
  /** Variação % contra o período anterior. */
  delta?: number | null;
  /** Para gasto, subir é ruim (vermelho); para consumo km/L, subir é bom. */
  menorMelhor?: boolean;
  destaque?: boolean;
}) {
  const t = TONS[tom];
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white p-4 shadow-card ring-1 ring-surface-border">
      {destaque && <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${t.faixa}`} />}
      <div className="flex items-start justify-between gap-2">
        <p className="text-meta font-medium uppercase tracking-wider text-text-subtle">{rotulo}</p>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${t.icone}`}><Icone size={18} aria-hidden /></span>
      </div>
      <p className="mt-1 truncate text-2xl font-bold tabular-nums tracking-tight text-text-title">{valor}</p>
      <div className="mt-1 flex min-h-[18px] flex-wrap items-center gap-x-1.5 text-meta">
        {delta !== undefined && <Delta v={delta} menorMelhor={menorMelhor} />}
        {detalhe && <span className="text-text-subtle">{detalhe}</span>}
      </div>
    </div>
  );
}

export function Delta({ v, menorMelhor = true, compacto }: { v: number | null; menorMelhor?: boolean; compacto?: boolean }) {
  if (v == null) return <span className="text-text-subtle">{compacto ? "—" : "sem comparação"}</span>;
  const arred = Math.round(v * 10) / 10;
  if (arred === 0) return <span className="text-text-subtle">{compacto ? "0%" : "= período anterior"}</span>;
  const ruim = menorMelhor ? arred > 0 : arred < 0;
  return (
    <span className={`font-semibold ${ruim ? "text-[#B42318]" : "text-[#067647]"}`}>
      {arred > 0 ? "▲" : "▼"} {Math.abs(arred).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
      {!compacto && <span className="ml-1 font-normal text-text-subtle">vs. anterior</span>}
    </span>
  );
}

export function GradeKpi({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>;
}

export type Opcao = { id: string; nome: string };

export function FiltroSelect({ rotulo, Icone, valor, onChange, opcoes, todos = "Todos" }: {
  rotulo: string; Icone: LucideIcon; valor: string; onChange: (v: string) => void; opcoes: Opcao[]; todos?: string;
}) {
  const ativo = !!valor;
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className={`flex items-center gap-1.5 text-meta font-semibold uppercase tracking-wider ${ativo ? "text-primary" : "text-text-subtle"}`}>
        <Icone size={13} aria-hidden /> {rotulo}
      </span>
      <span className="relative">
        <select
          className={`input appearance-none !py-2 pr-9 text-body-sm ${ativo ? "!border-primary/50 !bg-[#F5F8FF]" : ""}`}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{todos}</option>
          {opcoes.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-subtle" />
      </span>
    </label>
  );
}

/** Caixa dos filtros com a linha de "Filtros ativos" (chips removíveis). */
export function PainelFiltros({ children, ativos, onLimpar }: {
  children: ReactNode;
  ativos: { chave: string; rotulo: string; onRemover: () => void }[];
  onLimpar: () => void;
}) {
  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 shadow-card ring-1 ring-surface-border sm:p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{children}</div>
      {ativos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-surface-border pt-3">
          <span className="inline-flex items-center gap-1.5 text-meta font-medium text-text-subtle"><SlidersHorizontal size={14} /> Filtros ativos:</span>
          {ativos.map((a) => (
            <span key={a.chave} className="inline-flex items-center gap-1 rounded-pill bg-[#EFF4FF] py-1 pl-3 pr-1.5 text-meta font-medium text-primary">
              {a.rotulo}
              <button type="button" aria-label={`Remover filtro ${a.rotulo}`} onClick={a.onRemover} className="rounded-full p-0.5 hover:bg-primary/10"><X size={13} /></button>
            </span>
          ))}
          <button type="button" onClick={onLimpar} className="text-meta font-semibold text-primary hover:underline">Limpar tudo</button>
        </div>
      )}
    </div>
  );
}

/** Cartão com título — usado para gráficos e tabelas. */
export function Cartao({ titulo, Icone, acao, children, semPadding }: {
  titulo?: string; Icone?: LucideIcon; acao?: ReactNode; children: ReactNode; semPadding?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-surface-border">
      {titulo && (
        <header className="flex items-center justify-between gap-3 border-b border-surface-border px-5 py-3.5">
          <h3 className="flex items-center gap-2 text-body font-semibold text-text-title">
            {Icone && <Icone size={17} className="text-primary" aria-hidden />} {titulo}
          </h3>
          {acao}
        </header>
      )}
      <div className={semPadding ? "" : "p-5"}>{children}</div>
    </section>
  );
}

/** Tabela com cabeçalho fixo, zebrado e rolagem horizontal. */
export function Tabela({ children, minW = 900, altura = "max-h-[70vh]" }: { children: ReactNode; minW?: number; altura?: string }) {
  return (
    <div className={`overflow-auto ${altura}`}>
      <table
        className="w-full text-body-sm [&_tbody_tr:nth-child(even)]:bg-[#FAFBFC] [&_tbody_tr:hover]:bg-[#EFF4FF]/60 [&_tbody_td]:border-b [&_tbody_td]:border-surface-border/70 [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-[#F9FAFB] [&_thead_th]:shadow-[inset_0_-1px_0_#EAECF0] [&_tfoot_td]:sticky [&_tfoot_td]:bottom-0 [&_tfoot_td]:bg-[#F2F5FF] [&_tfoot_td]:shadow-[inset_0_1px_0_#D0D5DD]"
        style={{ minWidth: minW }}
      >
        {children}
      </table>
    </div>
  );
}

export const TH = "px-4 py-3 text-left text-meta font-semibold uppercase tracking-wider text-text-subtle";
export const THN = `${TH} !text-right`;
export const TD = "px-4 py-2.5";
export const TDN = "px-4 py-2.5 text-right tabular-nums whitespace-nowrap";
export const TF = "px-4 py-3 font-bold text-text-title";
export const TFN = `${TF} text-right tabular-nums whitespace-nowrap`;

export function Vazio({ titulo = "Nada por aqui", texto = "Amplie o período ou limpe os filtros para ver resultados." }: { titulo?: string; texto?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#F2F4F7] text-[#98A2B3]"><Inbox size={26} /></span>
      <p className="font-semibold text-text-title">{titulo}</p>
      <p className="max-w-sm text-body-sm text-text-subtle">{texto}</p>
    </div>
  );
}

export function Esqueleto({ linhas = 6 }: { linhas?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Carregando">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[116px] animate-pulse rounded-2xl bg-[#EEF1F6]" />)}
      </div>
      <div className="space-y-2 rounded-2xl bg-white p-5 shadow-card ring-1 ring-surface-border">
        {Array.from({ length: linhas }).map((_, i) => <div key={i} className="h-9 animate-pulse rounded-lg bg-[#F2F4F7]" style={{ opacity: 1 - i * 0.12 }} />)}
      </div>
    </div>
  );
}

/** Barra de participação (%), usada em tabelas. */
export function BarraPct({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-[#EEF1F6]">
        <div className="h-full rounded-full bg-gradient-to-r from-[#1D4ED8] to-[#3B82F6]" style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }} />
      </div>
      <span className="w-12 text-meta tabular-nums text-text-subtle">{pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</span>
    </div>
  );
}

export const reais = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const num = (v: number | null | undefined, casas = 2) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: casas });
export const reaisCurto = (v: number) =>
  Math.abs(v) >= 1_000_000 ? `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`
    : Math.abs(v) >= 1_000 ? `R$ ${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`
      : reais(v);

/** Período imediatamente anterior, com a mesma duração. */
export function periodoAnterior(inicio: string, fim: string): [string, string] | null {
  if (!inicio || !fim) return null;
  const i = new Date(`${inicio}T12:00`), f = new Date(`${fim}T12:00`);
  const dias = Math.round((f.getTime() - i.getTime()) / 86_400_000) + 1;
  const fa = new Date(i); fa.setDate(fa.getDate() - 1);
  const ia = new Date(fa); ia.setDate(ia.getDate() - dias + 1);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return [iso(ia), iso(fa)];
}
