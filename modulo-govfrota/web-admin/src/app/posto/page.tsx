"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Car, CheckCircle2, Droplets, FileSignature, Files, Fuel,
  HelpCircle, LifeBuoy, Sparkles, Upload, Wallet,
} from "lucide-react";
import {
  AbastecimentoPosto, brl, isoLocal, lembrarPeriodo, litros, MePosto, nomeProprio, PainelPosto, periodoDe, periodoLembrado, portal,
} from "@/lib/portalPosto";
import { dataCurta, EnviarNota, EnvioLote, hora, Placa, SeletorPeriodo, StatusNota, veiculo } from "@/components/posto/notas";

const br = (d: string) => new Date(`${d}T12:00`).toLocaleDateString("pt-BR");
const pctFmt = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

function saudacao() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

function Cartao({ rotulo, valor, detalhe, icone: Icone, href, tom = "azul", children }: {
  rotulo: string; valor: string; detalhe?: React.ReactNode; icone: typeof Fuel; href?: string;
  tom?: "azul" | "verde" | "ambar" | "vermelho"; children?: React.ReactNode;
}) {
  const cores = {
    azul: "from-[#3B82F6] to-[#1D4ED8] shadow-[#1D4ED8]/30",
    verde: "from-[#34D399] to-[#059669] shadow-[#059669]/30",
    ambar: "from-[#FBBF24] to-[#D97706] shadow-[#D97706]/30",
    vermelho: "from-[#F87171] to-[#DC2626] shadow-[#DC2626]/30",
  }[tom];
  const faixa = { azul: "bg-[#1D4ED8]", verde: "bg-[#059669]", ambar: "bg-[#D97706]", vermelho: "bg-[#DC2626]" }[tom];
  const corpo = (
    <div className="pp-cartao relative h-full overflow-hidden rounded-2xl border border-[#E3E8F2] bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
      <span className={`absolute inset-x-0 top-0 h-1 ${faixa}`} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-text-subtle">{rotulo}</p>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg ${cores}`}><Icone size={18} /></span>
      </div>
      <p className="mt-2 text-[28px] font-bold leading-tight tabular-nums tracking-tight text-text-title">{valor}</p>
      {detalhe && <div className="text-meta tabular-nums text-text-subtle">{detalhe}</div>}
      {children}
    </div>
  );
  return href ? <Link href={href} className="block">{corpo}</Link> : corpo;
}

/** Barras = litros por dia; linha = valor (R$). Hoje destacado; valor do dia no hover. */
function Grafico({ dias }: { dias: { dia: string; valor: number; litros: number }[] }) {
  const [foco, setFoco] = useState<number | null>(null);
  const maxL = Math.max(1, ...dias.map((d) => d.litros));
  const maxV = Math.max(1, ...dias.map((d) => d.valor));
  const hoje = isoLocal(new Date());
  const n = dias.length;
  const pontos = dias.map((d, i) => `${((i + 0.5) / n) * 100},${100 - (d.valor / maxV) * 92}`).join(" ");
  const marcar = (i: number) => i === 0 || i === n - 1 || (n > 10 && i % Math.ceil(n / 6) === 0);
  const f = foco !== null ? dias[foco] : null;
  return (
    <div>
      <div className="relative h-44" onMouseLeave={() => setFoco(null)}>
        <div className="absolute inset-0 flex items-end gap-[3px]">
          {dias.map((d, i) => (
            <div key={d.dia} className="flex h-full flex-1 items-end" onMouseEnter={() => setFoco(i)}>
              <div
                className={`w-full rounded-t-[3px] transition ${d.dia === hoje ? "bg-[#1D4ED8]" : d.litros ? "bg-[#BFD3FF]" : "bg-[#EEF2F7]"} ${foco === i ? "!bg-[#1D4ED8]" : ""}`}
                style={{ height: d.litros ? `${Math.max(4, (d.litros / maxL) * 92)}%` : "3px" }}
              />
            </div>
          ))}
        </div>
        {dias.some((d) => d.valor) && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            <polyline points={pontos} fill="none" stroke="#0F2A6B" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </svg>
        )}
        {f && (
          <div className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-[#0F172A] px-2.5 py-1.5 text-meta text-white shadow-lg"
            style={{ left: `${((foco! + 0.5) / n) * 100}%` }}>
            <p className="font-semibold">{br(f.dia)}</p>
            <p>{litros(f.litros)} · {brl(f.valor)}</p>
          </div>
        )}
      </div>
      <div className="mt-1.5 flex gap-[3px] text-[10px] text-text-subtle">
        {dias.map((d, i) => (
          <span key={d.dia} className={`flex-1 text-center ${d.dia === hoje ? "font-semibold text-[#1D4ED8]" : ""}`}>
            {marcar(i) || d.dia === hoje ? d.dia.slice(8, 10) : ""}
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-4 text-meta text-text-subtle">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#BFD3FF]" /> Litros</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3 bg-[#0F2A6B]" /> Valor (R$)</span>
      </div>
    </div>
  );
}

export default function InicioPosto() {
  const [[inicio, fim], setPeriodo] = useState<[string, string]>(periodoDe("mes"));
  const [p, setP] = useState<PainelPosto | null>(null);
  const [me, setMe] = useState<MePosto | null>(null);
  const [ultimos, setUltimos] = useState<AbastecimentoPosto[]>([]);
  const [enviando, setEnviando] = useState<AbastecimentoPosto | null>(null);
  const [lote, setLote] = useState(false);

  useEffect(() => {
    setPeriodo(periodoLembrado());
    portal.me().then(setMe).catch(() => {});
  }, []);

  const carregar = useCallback(() => {
    const erro = (e: unknown) => toast.error((e as Error).message);
    portal.painel(inicio, fim).then(setP).catch(erro);
    portal.abastecimentos({ inicio, fim }).then((l) => setUltimos(l.slice(0, 6))).catch(erro);
  }, [inicio, fim]);

  useEffect(() => { carregar(); }, [carregar]);

  const mudaPeriodo = (per: [string, string]) => {
    setPeriodo(per);
    lembrarPeriodo(per);
  };

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
      <div className="space-y-4">
        <div className="h-10 w-72 animate-pulse rounded-lg bg-white shadow-card" />
        <div className="h-24 animate-pulse rounded-2xl bg-white shadow-card" />
        <div className="grid gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-white shadow-card" />)}</div>
        <div className="h-72 animate-pulse rounded-2xl bg-white shadow-card" />
      </div>
    );
  }

  const n = p.notas;
  const pctNotas = p.abastecimentos ? Math.round((n.enviadas_no_periodo * 100) / p.abastecimentos) : 0;
  const variacao = p.anterior.valor ? ((p.valor - p.anterior.valor) * 100) / p.anterior.valor : null;
  const diasComMovimento = p.diario.filter((d) => d.valor || d.litros).length;
  const aoEnviar = () => { setEnviando(null); carregar(); };

  return (
    <div className="space-y-6">
      <div className="pp-sobe flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-1.5 text-body-sm font-medium text-[#1D5BD6]"><Sparkles size={14} aria-hidden /> {saudacao()}{me ? `, ${me.nome.split(" ")[0]}` : ""}</p>
          <h1 className="text-[32px] font-bold leading-tight tracking-tight text-text-title">Resumo do posto</h1>
          <p className="text-body-sm text-text-subtle">Movimento da Prefeitura no seu posto de {br(p.periodo.inicio)} a {br(p.periodo.fim)}.</p>
        </div>
        <SeletorPeriodo inicio={inicio} fim={fim} onChange={mudaPeriodo} />
      </div>

      {n.pendentes > 0 ? (
        <div className="pp-sobe pp-sobe-1 relative flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-3xl bg-gradient-to-br from-[#FFF1CC] via-[#FFF7E0] to-white p-6 ring-1 ring-[#F5D78E]">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#FBBF24]/20 blur-2xl" aria-hidden />
          <div className="relative flex items-center gap-4">
            <span className="pp-pulso flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FBBF24] to-[#D97706] text-white shadow-lg"><FileSignature size={26} /></span>
            <div>
              <p className="text-lg font-semibold text-[#5C4200]">{n.pendentes} abastecimento(s) aguardando nota fiscal</p>
              <p className="text-body-sm tabular-nums text-[#805600]">{brl(n.valor_pendente)} a faturar · todas as datas</p>
            </div>
          </div>
          <div className="relative flex flex-wrap gap-2">
            <button className="btn btn-secondary" onClick={() => setLote(true)}><Files size={16} /> Enviar em lote</button>
            <Link href="/posto/abastecimentos?nota=PENDENTE" className="btn btn-primary"><Upload size={16} /> Enviar agora</Link>
          </div>
        </div>
      ) : (
        <div className="pp-sobe pp-sobe-1 relative flex items-center gap-4 overflow-hidden rounded-3xl bg-gradient-to-br from-[#D9F7E6] via-[#EEFBF3] to-white p-6 ring-1 ring-[#B7E4C7]">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#34D399]/20 blur-2xl" aria-hidden />
          <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#34D399] to-[#059669] text-white shadow-lg shadow-[#059669]/30"><CheckCircle2 size={28} /></span>
          <div className="relative">
            <p className="text-xl font-bold text-[#0B3D20]">Tudo em dia</p>
            <p className="text-body-sm text-[#106D34]">Todos os abastecimentos já têm nota fiscal. Bom trabalho!</p>
          </div>
        </div>
      )}

      <section className="pp-sobe pp-sobe-2 grid gap-3 sm:grid-cols-3">
        {[
          { icone: Upload, titulo: "Enviar nota", texto: "PDF de um abastecimento", href: "/posto/abastecimentos?nota=PENDENTE", cor: "from-[#3B82F6] to-[#1D4ED8]" },
          { icone: Files, titulo: "Enviar em lote", texto: "Vários PDFs de uma vez", onClick: () => setLote(true), cor: "from-[#818CF8] to-[#4F46E5]" },
          { icone: LifeBuoy, titulo: "Suporte", texto: "Problema ou correção", href: "/posto/suporte", cor: "from-[#2DD4BF] to-[#0D9488]" },
        ].map((a) => {
          const conteudo = (
            <>
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md ${a.cor}`}><a.icone size={19} /></span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block font-semibold text-text-title">{a.titulo}</span>
                <span className="block text-meta text-text-subtle">{a.texto}</span>
              </span>
              <ArrowRight size={16} className="text-text-subtle transition group-hover:translate-x-1 group-hover:text-[#1D4ED8]" />
            </>
          );
          const cls = "pp-cartao group flex w-full items-center gap-3 rounded-2xl border border-[#E3E8F2] bg-white p-4";
          return a.href
            ? <Link key={a.titulo} href={a.href} className={cls}>{conteudo}</Link>
            : <button key={a.titulo} type="button" onClick={a.onClick} className={cls}>{conteudo}</button>;
        })}
      </section>

      <section className="pp-sobe pp-sobe-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Cartao icone={Wallet} rotulo="Faturado no período" valor={brl(p.valor)} href="/posto/abastecimentos?nota=TODOS"
          detalhe={
            <span className="inline-flex flex-wrap items-center gap-1">
              {litros(p.litros)}
              {variacao !== null && (
                <span className={`inline-flex items-center rounded-pill px-1.5 font-medium ${variacao >= 0 ? "bg-[#E7F8EC] text-[#106D34]" : "bg-[#FEE4E2] text-[#B42318]"}`}>
                  {variacao >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}{pctFmt(Math.abs(variacao))}
                </span>
              )}
              {variacao !== null && <span>vs. período anterior</span>}
            </span>
          } />
        <Cartao icone={Car} rotulo="Abastecimentos" valor={String(p.abastecimentos)} detalhe={`${p.veiculos} veículo(s) · ${diasComMovimento} dia(s) com movimento`}
          href="/posto/abastecimentos?nota=TODOS" />
        <Cartao icone={CheckCircle2} rotulo="Notas enviadas" tom="verde" valor={`${n.enviadas_no_periodo} de ${p.abastecimentos}`}
          href="/posto/abastecimentos?nota=ENVIADA">
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#EEF2F7]">
            <div className={`h-full rounded-full ${pctNotas === 100 ? "bg-[#16A34A]" : "bg-[#1D4ED8]"}`} style={{ width: `${pctNotas}%` }} />
          </div>
          <p className="mt-1 text-meta text-text-subtle">{pctNotas}% do período</p>
        </Cartao>
        <Cartao icone={AlertTriangle} rotulo="Notas com aviso" tom={n.com_aviso ? "vermelho" : "azul"} valor={String(n.com_aviso)}
          detalhe="valor ou CNPJ diferente do abastecimento" href={n.com_aviso ? "/posto/abastecimentos?aviso=1" : undefined} />
      </section>

      <section className="pp-sobe pp-sobe-4 grid gap-3 lg:grid-cols-3">
        <div className="rounded-3xl border border-[#E3E8F2] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,.04)] lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold text-text-title">Movimento por dia</h2>
            <p className="text-body-sm text-text-subtle">
              <Fuel className="mr-1 inline h-4 w-4" />{p.abastecimentos} · <Droplets className="mx-1 inline h-4 w-4" />{litros(p.litros)} ·{" "}
              <strong className="text-text-title">{brl(p.valor)}</strong>
            </p>
          </div>
          {diasComMovimento === 0 ? (
            <div className="flex h-44 flex-col items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-[#F5F8FF] to-white text-center ring-1 ring-dashed ring-[#DCE4F5]">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#1D5BD6] shadow-sm"><Fuel className="h-6 w-6" /></span>
              <p className="text-body-sm text-text-subtle">Sem abastecimentos no período.</p>
            </div>
          ) : (
            <Grafico dias={dias} />
          )}
          {p.anterior.valor > 0 && (
            <p className="mt-3 border-t border-surface-border pt-3 text-meta text-text-subtle">
              Período anterior ({br(p.anterior.inicio)} a {br(p.anterior.fim)}): {brl(p.anterior.valor)} · {litros(p.anterior.litros)}
            </p>
          )}
        </div>

        <div className="rounded-3xl border border-[#E3E8F2] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
          <h2 className="text-base font-semibold text-text-title">Por secretaria</h2>
          {p.por_secretaria.length === 0 ? (
            <p className="mt-4 text-body-sm text-text-subtle">Nenhum abastecimento no período.</p>
          ) : (
            <ul className="mt-3 space-y-4">
              {p.por_secretaria.map((s) => {
                const pct = p.valor ? (s.valor * 100) / p.valor : 0;
                return (
                  <li key={s.secretaria}>
                    <Link href={`/posto/abastecimentos?nota=TODOS&busca=${encodeURIComponent(s.secretaria)}`} className="group block">
                      <div className="flex justify-between gap-2 text-body-sm">
                        <span className="truncate font-medium text-text-title group-hover:text-[#1D4ED8]">{s.secretaria}</span>
                        <span className="shrink-0 font-semibold tabular-nums text-text-title">{brl(s.valor)}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 rounded-pill bg-[#EEF2F7]">
                        <div className="h-full rounded-pill bg-[#1D5BD6]" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="mt-1 text-meta tabular-nums text-text-subtle">
                        {pctFmt(pct)} · {s.abastecimentos} abast. · ticket médio {brl(s.abastecimentos ? s.valor / s.abastecimentos : 0)}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section className="pp-sobe pp-sobe-5 grid gap-3 lg:grid-cols-2">
        <div className="rounded-3xl border border-[#E3E8F2] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
          <h2 className="text-base font-semibold text-text-title">Contrato com a prefeitura</h2>
          {p.contratos.length === 0 ? (
            <p className="mt-3 text-body-sm text-text-subtle">Nenhum contrato ativo cadastrado para o seu posto.</p>
          ) : (
            <ul className="mt-3 space-y-4">
              {p.contratos.map((c, i) => {
                const diasFim = c.fim ? Math.ceil((new Date(`${c.fim}T23:59`).getTime() - Date.now()) / 86400000) : null;
                const alerta = c.pct_usado >= 90 || (diasFim !== null && diasFim <= 30);
                return (
                  <li key={i} className={`rounded-xl p-3 ring-1 ${alerta ? "bg-[#FFFBF0] ring-[#F5D78E]" : "ring-surface-border"}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-body-sm font-medium text-text-title">
                        {nomeProprio(c.combustivel)}{c.numero ? <span className="font-normal text-text-subtle"> · Contrato {c.numero}</span> : null}
                      </p>
                      <p className="text-meta tabular-nums text-text-subtle">{brl(c.preco_litro)}/L</p>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#EEF2F7]">
                      <div className={`h-full rounded-full ${c.pct_usado >= 90 ? "bg-[#D92D20]" : c.pct_usado >= 70 ? "bg-[#E0A100]" : "bg-[#1D5BD6]"}`}
                        style={{ width: `${Math.min(100, c.pct_usado)}%` }} />
                    </div>
                    <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-meta tabular-nums text-text-subtle">
                      <span>{litros(c.litros_usados)} de {litros(c.litros_contratados)} ({pctFmt(c.pct_usado)})</span>
                      <span className="font-medium text-text-title">Saldo {litros(c.saldo)}</span>
                    </div>
                    <p className="mt-1 text-meta text-text-subtle">
                      Vigência {c.inicio ? br(c.inicio) : "—"} a {c.fim ? br(c.fim) : "—"}
                      {diasFim !== null && diasFim >= 0 && diasFim <= 30 && <span className="font-medium text-[#B45309]"> · vence em {diasFim} dia(s)</span>}
                      {diasFim !== null && diasFim < 0 && <span className="font-medium text-[#B42318]"> · vencido</span>}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-3xl border border-[#E3E8F2] bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
          <h2 className="text-base font-semibold text-text-title">Combustíveis no período</h2>
          {p.por_combustivel.length === 0 ? (
            <p className="mt-3 text-body-sm text-text-subtle">Nenhum abastecimento no período.</p>
          ) : (
            <table className="mt-3 w-full text-body-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-text-subtle">
                <tr><th className="pb-2 font-semibold">Combustível</th><th className="pb-2 text-right font-semibold">Litros</th><th className="pb-2 text-right font-semibold">Preço médio</th><th className="pb-2 text-right font-semibold">Valor</th></tr>
              </thead>
              <tbody>
                {p.por_combustivel.map((c) => (
                  <tr key={c.combustivel} className="border-t border-surface-border">
                    <td className="py-2.5 text-text-title">{nomeProprio(c.combustivel)}</td>
                    <td className="py-2.5 text-right tabular-nums">{litros(c.litros)}</td>
                    <td className="py-2.5 text-right tabular-nums text-text-subtle">{c.preco_medio ? `${brl(c.preco_medio)}/L` : "—"}</td>
                    <td className="py-2.5 text-right font-semibold tabular-nums">{brl(c.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="pp-sobe pp-sobe-5 overflow-hidden rounded-3xl border border-[#E3E8F2] bg-white">
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-3.5">
          <h2 className="text-base font-semibold text-text-title">Últimos abastecimentos</h2>
          <Link href="/posto/abastecimentos?nota=TODOS" className="inline-flex items-center gap-1 text-body-sm font-medium text-[#1D4ED8] hover:underline">
            Ver todos <ArrowRight size={14} />
          </Link>
        </div>
        {ultimos.length === 0 ? (
          <p className="px-5 py-8 text-center text-body-sm text-text-subtle">Nenhum abastecimento no período.</p>
        ) : (
          <ul>
            {ultimos.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-surface-border px-5 py-3 last:border-0 hover:bg-[#F8FAFF]">
                <div className="w-32 shrink-0">
                  <p className="font-mono text-body-sm font-semibold text-[#1D4ED8]">{a.numero ?? "—"}</p>
                  <p className="text-meta tabular-nums text-text-subtle">{dataCurta(a.data)} · {hora(a.data)}</p>
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Placa placa={a.placa} />
                  <div className="min-w-0">
                    <p className="truncate text-body-sm text-text-title">{veiculo(a)}</p>
                    <p className="truncate text-meta text-text-subtle">{a.motorista ?? "—"} · {nomeProprio(a.combustivel)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-body-sm font-semibold tabular-nums text-text-title">{brl(a.valor)}</p>
                  <p className="text-meta tabular-nums text-text-subtle">{litros(a.litros)}</p>
                </div>
                <div className="w-full text-right sm:w-auto">
                  {a.nota ? <StatusNota a={a} /> : (
                    <button className="btn btn-primary btn-sm" onClick={() => setEnviando(a)}><Upload size={14} /> Enviar nota</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="group rounded-3xl border border-[#E3E8F2] bg-white p-6 text-body-sm text-text-body shadow-card" open={n.enviadas_no_periodo === 0 && n.pendentes > 0}>
        <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-text-title">
          <HelpCircle className="h-4 w-4 text-text-subtle" /> Como enviar as notas
          <span className="ml-auto text-meta text-text-subtle group-open:hidden">mostrar</span>
        </summary>
        <ol className="mt-3 list-decimal space-y-1 pl-5">
          <li>Emita a NF-e (ou NFC-e) de cada abastecimento com os mesmos litros e valor registrados aqui. Se puder, informe o nº do abastecimento (AB-…) nas observações da nota.</li>
          <li>Em <Link className="text-[#1D5BD6] underline" href="/posto/abastecimentos">Abastecimentos</Link>, clique em <strong>Enviar nota</strong> na linha do abastecimento e anexe o PDF.</li>
          <li>Tem várias? Use <strong>Enviar em lote</strong>: o sistema lê cada PDF e sugere o abastecimento.</li>
          <li>O sistema confere valor e CNPJ e avisa se algo não bater. O faturamento é feito pela Prefeitura a partir das notas enviadas.</li>
        </ol>
      </details>

      {enviando && <EnviarNota a={enviando} onFechar={() => setEnviando(null)} onEnviada={aoEnviar} />}
      {lote && <EnvioLote onFechar={() => { setLote(false); carregar(); }} onConcluido={carregar} />}
    </div>
  );
}
