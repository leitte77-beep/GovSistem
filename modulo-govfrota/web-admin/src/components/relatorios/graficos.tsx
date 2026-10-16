"use client";

/** Gráficos dos relatórios (Recharts) com a paleta do GovFrota. */

import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { reais, reaisCurto } from "./ui";

/** Paleta categórica: tons distinguíveis e legíveis no fundo branco. */
export const PALETA = ["#1D4ED8", "#16A34A", "#F59E0B", "#7C3AED", "#DC2626", "#0891B2", "#DB2777", "#65A30D", "#EA580C", "#475467"];

const EIXO = { fontSize: 12, fill: "#667085" };
const GRADE = "#EEF1F6";

type Formato = "moeda" | "litros" | "numero";
const fmt = (f: Formato, v: number) =>
  f === "moeda" ? reais(v) : f === "litros" ? `${v.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} L` : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const fmtEixo = (f: Formato, v: number) =>
  f === "moeda" ? reaisCurto(v) : v >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : String(v);

function Dica({ active, payload, label, formato }: {
  active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; formato: Formato;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-white px-3 py-2 text-meta shadow-elevated ring-1 ring-surface-border">
      {label && <p className="mb-1 font-semibold text-text-title">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-text-body">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: p.color }} />
          {p.name}: <b className="tabular-nums">{fmt(formato, p.value)}</b>
        </p>
      ))}
    </div>
  );
}

export type Serie = { chave: string; nome: string; cor?: string };

/** Colunas verticais (série temporal ou categorias curtas); empilha quando há várias séries. */
export function Colunas({ dados, x, series, formato = "moeda", altura = 260, empilhar }: {
  dados: Record<string, string | number>[]; x: string; series: Serie[]; formato?: Formato; altura?: number; empilhar?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRADE} />
        <XAxis dataKey={x} tick={EIXO} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={12} />
        <YAxis tick={EIXO} tickLine={false} axisLine={false} width={70} tickFormatter={(v) => fmtEixo(formato, v)} />
        <Tooltip cursor={{ fill: "#F2F5FF" }} content={<Dica formato={formato} />} />
        {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => (
          <Bar key={s.chave} dataKey={s.chave} name={s.nome} fill={s.cor ?? PALETA[i]} stackId={empilhar ? "a" : undefined}
            radius={empilhar && i < series.length - 1 ? 0 : [6, 6, 0, 0]} maxBarSize={44} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Barras horizontais — bom para ranking com nomes longos (secretarias, veículos). */
export function Ranking({ dados, rotulo, series, formato = "moeda", empilhar }: {
  dados: Record<string, string | number>[]; rotulo: string; series: Serie[]; formato?: Formato; empilhar?: boolean;
}) {
  const altura = Math.max(160, dados.length * 38 + 40);
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke={GRADE} />
        <XAxis type="number" tick={EIXO} tickLine={false} axisLine={false} tickFormatter={(v) => fmtEixo(formato, v)} />
        <YAxis type="category" dataKey={rotulo} tick={EIXO} tickLine={false} axisLine={false} width={150}
          tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)} />
        <Tooltip cursor={{ fill: "#F2F5FF" }} content={<Dica formato={formato} />} />
        {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => (
          <Bar key={s.chave} dataKey={s.chave} name={s.nome} fill={s.cor ?? PALETA[i]} stackId={empilhar ? "a" : undefined}
            radius={empilhar && i < series.length - 1 ? 0 : [0, 6, 6, 0]} barSize={20} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Rosca com total no centro e legenda lateral com valores. */
export function Rosca({ dados, formato = "moeda", rotuloTotal = "Total" }: {
  dados: { nome: string; valor: number }[]; formato?: Formato; rotuloTotal?: string;
}) {
  const total = dados.reduce((s, d) => s + d.valor, 0);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-48 w-48 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={dados} dataKey="valor" nameKey="nome" innerRadius="62%" outerRadius="100%" paddingAngle={dados.length > 1 ? 2 : 0} stroke="none">
              {dados.map((_, i) => <Cell key={i} fill={PALETA[i % PALETA.length]} />)}
            </Pie>
            <Tooltip content={<Dica formato={formato} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-meta text-text-subtle">{rotuloTotal}</span>
          <span className="text-body font-bold tabular-nums text-text-title">{formato === "moeda" ? reaisCurto(total) : fmt(formato, total)}</span>
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-2">
        {dados.map((d, i) => (
          <li key={d.nome} className="flex items-center gap-2 text-body-sm">
            <span className="h-3 w-3 shrink-0 rounded" style={{ backgroundColor: PALETA[i % PALETA.length] }} />
            <span className="min-w-0 flex-1 truncate text-text-body" title={d.nome}>{d.nome}</span>
            <span className="tabular-nums font-semibold text-text-title">{fmt(formato, d.valor)}</span>
            <span className="w-12 text-right text-meta tabular-nums text-text-subtle">{total ? Math.round((d.valor / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
