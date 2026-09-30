"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { AlertTriangle, ArrowRight, CheckCircle2, Droplets, FileUp, Fuel, HelpCircle } from "lucide-react";
import { Kpi } from "@/components/posto/Kpi";
import {
  AbastecimentoPosto, brl, dataHora, litros, nomeProprio, PainelPosto, portal,
} from "@/lib/portalPosto";

export default function InicioPosto() {
  const [p, setP] = useState<PainelPosto | null>(null);
  const [ultimos, setUltimos] = useState<AbastecimentoPosto[]>([]);

  useEffect(() => {
    const erro = (e: unknown) => toast.error((e as Error).message);
    portal.painel().then(setP).catch(erro);
    portal.abastecimentos({}).then((l) => setUltimos(l.slice(0, 5))).catch(erro);
  }, []);

  // Barras por dia do mês (dias sem abastecimento aparecem vazios).
  const dias = useMemo(() => {
    if (!p) return [];
    const mapa = new Map(p.diario.map((d) => [d.dia, d]));
    const out: { dia: string; valor: number; litros: number }[] = [];
    for (let d = new Date(p.periodo.inicio + "T12:00"); d <= new Date(p.periodo.fim + "T12:00"); d.setDate(d.getDate() + 1)) {
      const k = d.toISOString().slice(0, 10);
      out.push({ dia: k, valor: mapa.get(k)?.valor ?? 0, litros: mapa.get(k)?.litros ?? 0 });
    }
    return out;
  }, [p]);

  if (!p) {
    return (
      <div className="space-y-3">
        <div className="h-20 animate-pulse rounded-card bg-white shadow-card" />
        <div className="grid gap-3 md:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-card bg-white shadow-card" />)}</div>
      </div>
    );
  }

  const n = p.notas;
  const maxDia = Math.max(1, ...dias.map((d) => d.valor));
  const maxSec = Math.max(1, ...p.por_secretaria.map((s) => s.valor));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-h1 text-text-title">Resumo</h1>
        <p className="text-body-sm text-text-subtle">O movimento da Prefeitura no seu posto e as notas fiscais que faltam enviar.</p>
      </div>

      {n.pendentes > 0 ? (
        <Link href="/posto/abastecimentos" className="flex flex-wrap items-center gap-3 rounded-card border border-[#F5D98B] bg-[#FFFBEF] p-4 transition hover:shadow-elevated">
          <FileUp className="h-6 w-6 shrink-0 text-[#805600]" />
          <p className="flex-1 text-body-sm text-text-title">
            <strong>{n.pendentes} abastecimento(s) sem nota fiscal</strong> ({brl(n.valor_pendente)}). Envie o XML e/ou o PDF de cada um.
          </p>
          <span className="btn btn-primary btn-sm">Enviar notas <ArrowRight size={14} /></span>
        </Link>
      ) : (
        <div className="flex items-center gap-3 rounded-card border border-surface-border bg-white p-4 shadow-card">
          <CheckCircle2 className="h-6 w-6 shrink-0 text-[#16A34A]" />
          <p className="text-body-sm text-text-title">Tudo em dia. Todos os abastecimentos já têm nota fiscal.</p>
        </div>
      )}

      <section className="grid gap-3 md:grid-cols-3">
        <Kpi icon={FileUp} rotulo="Sem nota fiscal" valor={String(n.pendentes)} nota={brl(n.valor_pendente)} tom={n.pendentes ? "amarelo" : "neutro"} href="/posto/abastecimentos" />
        <Kpi icon={CheckCircle2} rotulo="Notas enviadas no mês" valor={String(n.enviadas_no_periodo)} nota={`de ${p.abastecimentos} abastecimento(s)`} tom={n.enviadas_no_periodo ? "verde" : "neutro"} />
        <Kpi icon={AlertTriangle} rotulo="Notas com aviso" valor={String(n.com_aviso)} nota="valor ou CNPJ diferente" tom={n.com_aviso ? "vermelho" : "neutro"} href={n.com_aviso ? "/posto/abastecimentos" : undefined} />
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        {/* Movimento do mês */}
        <div className="rounded-card border border-surface-border bg-white p-4 shadow-card lg:col-span-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-label font-semibold text-text-title">Movimento do mês</h2>
            <p className="text-body-sm text-text-subtle">
              <Fuel className="mr-1 inline h-4 w-4" />{p.abastecimentos} abastecimento(s) · <Droplets className="mx-1 inline h-4 w-4" />{litros(p.litros)} · <strong className="text-text-title">{brl(p.valor)}</strong>
            </p>
          </div>
          <div className="mt-4 flex h-36 items-end gap-[3px]" role="img" aria-label="Valor abastecido por dia no mês">
            {dias.map((d) => (
              <div key={d.dia} className="group relative flex h-full flex-1 items-end">
                <div
                  className={`w-full rounded-t-sm ${d.valor ? "bg-[#1D5BD6] group-hover:bg-[#1D4ED8]" : "bg-[#EEF0F4]"}`}
                  style={{ height: d.valor ? `${Math.max(4, (d.valor / maxDia) * 100)}%` : "3px" }}
                />
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-btn bg-[#101828] px-2 py-1 text-meta text-white group-hover:block">
                  {d.dia.slice(8, 10)}/{d.dia.slice(5, 7)} · {litros(d.litros)} · {brl(d.valor)}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-meta text-text-subtle">
            <span>{dias[0]?.dia.slice(8, 10)}/{dias[0]?.dia.slice(5, 7)}</span>
            <span>{dias.at(-1)?.dia.slice(8, 10)}/{dias.at(-1)?.dia.slice(5, 7)}</span>
          </div>
        </div>

        {/* Por secretaria */}
        <div className="rounded-card border border-surface-border bg-white p-4 shadow-card">
          <h2 className="text-label font-semibold text-text-title">Por secretaria no mês</h2>
          {p.por_secretaria.length === 0 ? (
            <p className="mt-4 text-body-sm text-text-subtle">Nenhum abastecimento no mês.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {p.por_secretaria.map((s) => (
                <li key={s.secretaria}>
                  <div className="flex justify-between gap-2 text-body-sm">
                    <span className="truncate text-text-body">{s.secretaria}</span>
                    <span className="shrink-0 font-medium tabular-nums text-text-title">{brl(s.valor)}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-pill bg-[#EEF0F4]">
                    <div className="h-full rounded-pill bg-[#1D5BD6]" style={{ width: `${(s.valor / maxSec) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Últimos abastecimentos */}
      <section className="rounded-card border border-surface-border bg-white shadow-card">
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
          <h2 className="text-label font-semibold text-text-title">Últimos abastecimentos</h2>
          <Link href="/posto/abastecimentos" className="text-body-sm font-medium text-[#1D4ED8] hover:underline">Ver todos →</Link>
        </div>
        {ultimos.length === 0 ? (
          <p className="px-4 py-6 text-center text-body-sm text-text-subtle">Nenhum abastecimento no mês.</p>
        ) : (
          <ul>
            {ultimos.map((a) => (
              <li key={a.id} className="flex items-center gap-3 border-b border-surface-border px-4 py-3 last:border-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F3F4F6] text-text-subtle"><Fuel className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm font-medium text-text-title">
                    {a.placa} <span className="font-normal text-text-subtle">· {[a.marca, a.modelo].filter(Boolean).join(" ")}</span>
                  </p>
                  <p className="truncate text-meta text-text-subtle">{dataHora(a.data)} · {a.motorista ?? "—"} · {nomeProprio(a.combustivel)}</p>
                </div>
                <div className="text-right">
                  <p className="text-body-sm font-semibold tabular-nums text-text-title">{brl(a.valor)}</p>
                  <p className="text-meta tabular-nums text-text-subtle">{litros(a.litros)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="group rounded-card border border-surface-border bg-white p-4 text-body-sm text-text-body shadow-card" open={n.enviadas_no_periodo === 0}>
        <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-text-title">
          <HelpCircle className="h-4 w-4 text-text-subtle" /> Como enviar as notas
          <span className="ml-auto text-meta text-text-subtle group-open:hidden">mostrar</span>
        </summary>
        <ol className="mt-3 list-decimal space-y-1 pl-5">
          <li>Emita a NF-e (ou NFC-e) de cada abastecimento com os mesmos litros e valor registrados aqui.</li>
          <li>Em <Link className="text-[#1D5BD6] underline" href="/posto/abastecimentos">Abastecimentos</Link>, clique em <strong>Enviar nota</strong> na linha do abastecimento.</li>
          <li>Anexe o XML e/ou o PDF (DANFE). O sistema lê a nota e avisa se o valor ou o CNPJ não batem.</li>
          <li>O faturamento é feito pela Prefeitura a partir das notas enviadas.</li>
        </ol>
      </details>
    </div>
  );
}
