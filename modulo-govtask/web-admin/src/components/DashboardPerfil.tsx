"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, FolderKanban, ListTodo, RefreshCw, Users } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";

type Perfil = "prefeito" | "assessor" | "secretario" | "departamento";
const COPY: Record<Perfil, { titulo: string; subtitulo: string; foco: string }> = {
  prefeito: { titulo: "Visão do Município", subtitulo: "Acompanhamento simples do que exige decisão e do que já foi entregue.", foco: "Minhas determinações" },
  assessor: { titulo: "Central do Assessor", subtitulo: "Controle estratégico, retornos e cobranças em uma única fila.", foco: "Demandas sob minha gestão" },
  secretario: { titulo: "Painel da Secretaria", subtitulo: "Ritmo dos departamentos, prazos e pontos que precisam de intervenção.", foco: "Demandas da secretaria" },
  departamento: { titulo: "Meu trabalho", subtitulo: "Comece pelo que você recebeu e conclua cada providência no prazo.", foco: "Tarefas para executar" },
};

export function DashboardPerfil({ perfil }: { perfil: Perfil }) {
  const [dados, setDados] = useState<any>();
  const [erro, setErro] = useState<string>();
  const carregar = useCallback(async () => {
    try { setErro(undefined); setDados(await api.getDashboardPerfil(perfil)); }
    catch (e: any) { setErro(e.message || "Não foi possível carregar o painel."); }
  }, [perfil]);
  useEffect(() => { carregar(); }, [carregar]);
  const copy = COPY[perfil];
  if (!dados && !erro) return <div className="animate-pulse space-y-5"><div className="h-24 rounded-2xl bg-slate-200" /><div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[1,2,3,4].map(i => <div key={i} className="h-28 rounded-xl bg-slate-200" />)}</div></div>;
  if (erro) return <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800"><p className="font-semibold">Painel indisponível</p><p className="text-sm mt-1">{erro}</p><button onClick={carregar} className="mt-3 text-sm font-semibold underline">Tentar novamente</button></div>;
  const m = dados.metricas;
  const cards = perfil === "departamento"
    ? [["Recebidas", m.minha_acao, "#2563eb"], ["Atrasadas", m.atrasadas, "#b42318"], ["Vencem esta semana", m.vencendo, "#b54708"], ["Aguardando terceiros", m.aguardando_terceiros, "#6941c6"]]
    : [["Demandas abertas", m.abertas, "#2563eb"], ["Precisam de atenção", dados.atencao.length, "#b54708"], ["Atrasadas", m.atrasadas, "#b42318"], ["Vencem esta semana", m.vencendo, "#6941c6"]];
  return <div className="max-w-7xl space-y-6">
    <section className="relative overflow-hidden rounded-2xl bg-[#10233e] p-6 sm:p-8 text-white">
      <div className="absolute -right-10 -top-14 h-52 w-52 rounded-full bg-blue-500/30 blur-3xl" />
      <div className="relative flex items-start justify-between gap-5"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-blue-200">GovTask · acompanhamento</p><h1 className="mt-2 text-3xl font-bold tracking-tight">{copy.titulo}</h1><p className="mt-2 max-w-2xl text-sm text-slate-300">{copy.subtitulo}</p></div><button onClick={carregar} aria-label="Atualizar painel" className="rounded-lg border border-white/15 p-2 text-slate-200 hover:bg-white/10"><RefreshCw className="h-4 w-4" /></button></div>
      <div className="relative mt-7 flex gap-8"><div><p className="text-xs text-slate-300">Recursos em andamento</p><p className="mt-1 text-2xl font-bold">R$ {Number(m.recursos_andamento).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p></div><div className="border-l border-white/15 pl-8"><p className="text-xs text-slate-300">Concluídas no ano</p><p className="mt-1 text-2xl font-bold">{m.concluidas_ano}</p></div></div>
    </section>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{cards.map(([rotulo, valor, cor]) => <Link key={String(rotulo)} href="/minhas-demandas" className="rounded-xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-md"><span className="block h-1 w-10 rounded-full" style={{background: String(cor)}} /><p className="mt-4 text-3xl font-bold text-slate-900">{valor}</p><p className="mt-1 text-sm text-slate-600">{rotulo}</p></Link>)}</div>
    <div className="grid gap-6 lg:grid-cols-5">
      <section className="lg:col-span-3 rounded-xl border border-slate-200 bg-white"><header className="flex items-center gap-2 border-b border-slate-100 px-5 py-4"><AlertTriangle className="h-5 w-5 text-amber-600" /><div><h2 className="font-semibold text-slate-900">O que exige minha atenção hoje?</h2><p className="text-xs text-slate-500">Situações ordenadas por risco e prazo.</p></div></header><div className="divide-y divide-slate-100">{dados.atencao.length ? dados.atencao.map((a: any) => <Link href={a.demanda_id ? `/demandas/${a.demanda_id}` : "/alertas"} key={a.id} className="block px-5 py-4 hover:bg-slate-50"><p className="font-medium text-sm text-slate-800">{a.titulo}</p>{a.detalhe && <p className="mt-1 text-xs text-slate-500">{a.detalhe}</p>}</Link>) : <p className="px-5 py-10 text-center text-sm text-slate-500">Nenhuma situação crítica agora.</p>}</div></section>
      <section className="lg:col-span-2 rounded-xl border border-slate-200 bg-white"><header className="flex items-center gap-2 border-b border-slate-100 px-5 py-4"><Users className="h-5 w-5 text-blue-600" /><h2 className="font-semibold text-slate-900">{perfil === "secretario" ? "Carga por setor" : copy.foco}</h2></header><div className="divide-y divide-slate-100">{(perfil === "departamento" ? dados.tarefas : dados.demandas).slice(0, 7).map((item: any) => <Link key={item.id} href={item.demanda_id ? `/demandas/${item.demanda_id}` : `/demandas/${item.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50"><FolderKanban className="h-4 w-4 text-slate-400"/><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-800">{item.titulo}</p><p className="text-xs text-slate-500">{item.numero || item.demanda || item.status}</p></div><ArrowRight className="h-4 w-4 text-slate-400"/></Link>) || <p className="px-5 py-10 text-center text-sm text-slate-500">Sem itens para mostrar.</p>}</div></section>
    </div>
    {perfil === "prefeito" && <section className="rounded-xl border border-slate-200 bg-white"><header className="flex items-center gap-2 border-b border-slate-100 px-5 py-4"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><h2 className="font-semibold text-slate-900">Conquistas concluídas</h2></header><div className="grid sm:grid-cols-2 lg:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">{dados.conquistas.length ? dados.conquistas.slice(0,3).map((d: any) => <Link href={`/demandas/${d.id}`} className="p-5" key={d.id}><p className="font-semibold text-slate-800">{d.titulo}</p><p className="mt-2 text-sm text-emerald-700">Finalizada {d.concluida_em ? formatDate(d.concluida_em) : "recentemente"}</p></Link>) : <p className="p-5 text-sm text-slate-500">Ainda não há conquistas registradas.</p>}</div></section>}
  </div>;
}
