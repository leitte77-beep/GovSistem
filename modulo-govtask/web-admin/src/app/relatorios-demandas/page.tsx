"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowDownToLine, BarChart3, Clock3, Download, FileText, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";

type Resumo = Awaited<ReturnType<typeof api.relatorioDemandasResumo>>;
const numero = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default function RelatoriosDemandasPage() {
  const [dados, setDados] = useState<Resumo | null>(null);
  const [erro, setErro] = useState("");
  const carregar = () => { setErro(""); api.relatorioDemandasResumo().then(setDados).catch(e => setErro(e.message)); };
  const exportar = async () => { try { const blob = await api.baixarRelatorioDemandasCsv(); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "relatorio-demandas.csv"; a.click(); URL.revokeObjectURL(url); } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível exportar o relatório"); } };
  useEffect(carregar, []);
  const maior = Math.max(1, ...Object.values(dados?.backlog_por_setor || {}), ...Object.values(dados?.heatmap_prazos || {}));
  return <main className="mx-auto max-w-7xl space-y-6 pb-10">
    <header className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-end">
      <div><p className="text-xs font-bold uppercase tracking-[.16em] text-indigo-700">Central gerencial</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Relatórios de demandas</h1><p className="mt-1 max-w-2xl text-sm text-slate-600">Leitura semanal de ritmo, carga e risco operacional para decisão de gestão.</p></div>
      <div className="flex gap-2"><button onClick={carregar} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"><RefreshCw className="h-4 w-4"/>Atualizar</button><button onClick={exportar} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"><Download className="h-4 w-4"/>Exportar CSV</button></div>
    </header>
    {erro && <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">Não foi possível carregar os indicadores: {erro}</p>}
    {!dados && !erro && <p className="py-16 text-center text-sm text-slate-500">Preparando a visão gerencial…</p>}
    {dados && <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Indicador label="Demandas ativas" valor={dados.ativas} icone={FileText} /><Indicador label="Atrasadas" valor={dados.atrasadas} icone={AlertTriangle} tom="red" detalhe={`${dados.sem_movimentacao} sem movimentação`} /><Indicador label="Conclusões na semana" valor={dados.concluidas_semana} icone={BarChart3} detalhe={`${dados.novas_semana} novas entradas`} /><Indicador label="Idade média do backlog" valor={`${dados.idade_media_dias} dias`} icone={Clock3} detalhe={`${dados.movimentadas_semana} movimentadas`} /></section>
      <section className="grid gap-5 lg:grid-cols-[1.35fr_.65fr]"><Painel titulo="Gargalos por setor" subtitulo="Volume ativo aguardando tratamento"><Barras itens={dados.backlog_por_setor} max={maior} cor="bg-indigo-600" vazio="Não há demandas abertas por setor."/></Painel><Painel titulo="Resumo executivo" subtitulo="Sinal rápido para a reunião de gestão"><div className="space-y-4 pt-2"><Linha label="Valor em andamento" valor={numero.format(dados.valor_andamento)} /><Linha label="Demandas sem ação há 7 dias" valor={String(dados.sem_movimentacao)} alerta /><Linha label="Risco de prazo" valor={`${dados.atrasadas} atrasadas`} alerta={dados.atrasadas > 0} /><a href="/operacao" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-indigo-700 hover:text-indigo-900"><ArrowDownToLine className="h-4 w-4"/>Abrir mesa operacional</a></div></Painel></section>
      <section><Painel titulo="Heatmap de prazo" subtitulo="Demandas com prazo até os próximos 7 dias; barras mais longas indicam concentração de risco."><Barras itens={dados.heatmap_prazos} max={maior} cor="bg-amber-500" vazio="Nenhum prazo crítico nos próximos 7 dias."/></Painel></section>
    </>}
  </main>;
}
function Indicador({label, valor, icone: Icon, detalhe, tom="indigo"}:{label:string;valor:string|number;icone:any;detalhe?:string;tom?:"indigo"|"red"}) { const cores=tom==="red"?"bg-red-50 text-red-700":"bg-indigo-50 text-indigo-700"; return <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between"><p className="text-sm font-medium text-slate-600">{label}</p><span className={`rounded-lg p-2 ${cores}`}><Icon className="h-4 w-4"/></span></div><p className="mt-4 text-2xl font-bold tracking-tight text-slate-950">{valor}</p>{detalhe&&<p className="mt-1 text-xs text-slate-500">{detalhe}</p>}</article> }
function Painel({titulo,subtitulo,children}:{titulo:string;subtitulo:string;children:ReactNode}) { return <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-950">{titulo}</h2><p className="mt-1 text-xs text-slate-500">{subtitulo}</p>{children}</article> }
function Barras({itens,max,cor,vazio}:{itens:Record<string,number>;max:number;cor:string;vazio:string}) { const entradas=Object.entries(itens).sort((a,b)=>b[1]-a[1]); if(!entradas.length)return <p className="py-8 text-sm text-slate-500">{vazio}</p>; return <div className="mt-5 space-y-4">{entradas.map(([nome,valor])=><div key={nome}><div className="mb-1 flex justify-between gap-3 text-sm"><span className="truncate font-medium text-slate-700">{nome}</span><span className="font-mono text-slate-500">{valor}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${cor}`} style={{width:`${Math.max(6, valor/max*100)}%`}}/></div></div>)}</div> }
function Linha({label,valor,alerta=false}:{label:string;valor:string;alerta?:boolean}) { return <div className="flex items-baseline justify-between gap-4 border-b border-slate-100 pb-3"><span className="text-sm text-slate-600">{label}</span><strong className={alerta?"text-red-700":"text-slate-900"}>{valor}</strong></div> }
