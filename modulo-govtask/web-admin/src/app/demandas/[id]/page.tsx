"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Bell, BellOff, CalendarDays, Clock3, Copy, FileDown, ListTodo, RefreshCw, ShieldAlert, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PERM } from "@/lib/perfil";
import { notify } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";
import { ChecklistsTab } from "@/components/demanda/ChecklistsTab";
import { ComentariosTab } from "@/components/demanda/ComentariosTab";
import { FinanceiroDemandaTab } from "@/components/demanda/FinanceiroDemandaTab";
import { ProtocolosTab } from "@/components/demanda/ProtocolosTab";
import { GestaoTab } from "@/components/demanda/GestaoTab";
import { ObrasDemandaTab } from "@/components/demanda/ObrasDemandaTab";
import { DocumentosDemandaTab } from "@/components/demanda/DocumentosDemandaTab";
import { EdicaoDemanda } from "@/components/demanda/EdicaoDemanda";
import { IASugestoes } from "@/components/demanda/IASugestoes";
import type { DemandaV2 } from "@/types/govtask";

export default function DemandaDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, hasPermission } = useAuth();
  // A autorização é do servidor; aqui só evitamos mostrar botão que devolveria
  // 403 ao ser clicado.
  const podeEditar = hasPermission(PERM.EDIT, PERM.ADMIN);
  const podeLancar = hasPermission(PERM.FINANCIAL_MANAGE, PERM.ADMIN);
  const podeExportar = hasPermission(PERM.EXPORT, PERM.ADMIN);
  const podeEngenharia = hasPermission(PERM.ENGINEERING, PERM.ADMIN);
  const [demanda, setDemanda] = useState<DemandaV2>();
  const [tarefas, setTarefas] = useState<any[]>([]);
  const [eventos, setEventos] = useState<any[]>([]);
  const [aba, setAba] = useState("visao");
  const [erro, setErro] = useState("");
  const [seguindo, setSeguindo] = useState(false);
  useEffect(() => { Promise.all([api.getDemandaV2(id), api.listarTarefasDemanda(id), api.timelineDemanda(id)]).then(([d, t, e]) => { setDemanda(d); setSeguindo(Boolean(d.seguindo)); setTarefas(t); setEventos(e.items || []); }).catch(e => setErro(e.message)); }, [id]);
  if (erro) return <div className="rounded-xl bg-red-50 p-5 text-red-800">{erro}</div>;
  if (!demanda) return <div className="animate-pulse space-y-4"><div className="h-32 rounded-2xl bg-slate-200"/><div className="h-64 rounded-xl bg-slate-200"/></div>;
  const duplicar = async () => { try { const nova = await api.duplicarDemanda(id); router.push(`/demandas/${nova.id}`); } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível duplicar a demanda"); } };
  const alternarSeguir = async () => {
    try {
      if (seguindo) await api.deixarDeSeguirDemanda(id);
      else await api.seguirDemanda(id);
      setSeguindo(!seguindo);
      notify.success(seguindo ? "Você deixou de acompanhar" : "Agora você acompanha esta demanda");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível alterar o acompanhamento");
    }
  };
  const baixarPdf = async () => {
    try {
      const blob = await api.baixarRelatorioDemandaPdf(id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `demanda-${demanda.numero.replace("/", "-")}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível gerar o PDF");
    }
  };
  const regerarResumo = async () => {
    try {
      const { resumo_executivo } = await api.gerarResumoExecutivo(id);
      setDemanda({ ...demanda, resumo_executivo });
      notify.success("Resumo executivo atualizado");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível gerar o resumo");
    }
  };
  const aplicarSugestao = async (campo: "resumo_executivo" | "proxima_acao", valor: string) => {
    try {
      const atualizada = await api.atualizarDemandaV2(id, { [campo]: valor, versao_esperada: demanda.versao });
      setDemanda(atualizada);
      notify.success("Sugestão aplicada à demanda");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível aplicar a sugestão");
    }
  };
  const abas: [string, string][] = [
    ["visao", "Visão geral"],
    ["tarefas", `Tarefas (${tarefas.length})`],
    ["documentos", "Documentos"],
    ["checklists", "Checklists"],
    ["gestao", "Gestão"],
    ["obras", "Obras"],
    ["protocolos", "Protocolos"],
    ["financeiro", "Financeiro"],
    ["comentarios", "Comentários"],
    ["timeline", "Histórico"],
  ];
  return <div className="max-w-7xl space-y-6"><Link href="/demandas" className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-blue-700"><ArrowLeft className="h-4 w-4"/>Voltar para demandas</Link><section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="border-l-4 border-blue-700 p-6"><div className="flex flex-col justify-between gap-4 lg:flex-row"><div><p className="font-mono text-xs text-slate-500">DEMANDA {demanda.numero}</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{demanda.titulo}</h1><p className="mt-2 max-w-3xl text-sm text-slate-600">{demanda.objeto || demanda.descricao || "Registre o objeto e os próximos passos para manter esta demanda rastreável."}</p></div><div className="flex gap-2">{podeExportar && <button onClick={baixarPdf} className="inline-flex h-fit items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-xs font-bold text-slate-700 hover:border-blue-500"><FileDown className="h-3.5 w-3.5"/>Relatório PDF</button>}<button onClick={duplicar} className="inline-flex h-fit items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-xs font-bold text-slate-700 hover:border-blue-500"><Copy className="h-3.5 w-3.5"/>Duplicar</button><button onClick={alternarSeguir} aria-pressed={seguindo} className={`inline-flex h-fit items-center gap-1 rounded-lg border px-2 py-1 text-xs font-bold ${seguindo ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-300 text-slate-700 hover:border-blue-500"}`}>{seguindo ? <BellOff className="h-3.5 w-3.5"/> : <Bell className="h-3.5 w-3.5"/>}{seguindo ? "Acompanhando" : "Acompanhar"}</button><span className={`h-fit rounded-full px-3 py-1 text-xs font-bold ${demanda.atrasada ? "bg-red-100 text-red-700" : "bg-blue-50 text-blue-700"}`}>{demanda.atrasada ? "ATRASADA" : demanda.status?.rotulo?.toUpperCase() || "ABERTA"}</span><span className="h-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{demanda.prioridade}</span></div></div><div className="mt-6 grid gap-4 sm:grid-cols-4"><Info icon={<UserRound/>} label="Responsável geral" value={demanda.responsavel_geral?.name || "Não definido"}/><Info icon={<ListTodo/>} label="Setor atual" value={demanda.setor_atual?.nome || "A definir"}/><Info icon={<CalendarDays/>} label="Prazo final" value={demanda.prazo_final ? formatDate(demanda.prazo_final) : "Sem prazo"}/><Info icon={<Clock3/>} label="Próxima ação" value={demanda.proxima_acao || "Não definida"}/></div></div><div className="h-2 bg-slate-100"><div className="h-full bg-blue-600" style={{ width: `${demanda.progresso}%` }}/></div></section><nav className="flex gap-1 overflow-auto border-b border-slate-200">{abas.map(([key, label]) => <button key={key} onClick={() => setAba(key)} className={`whitespace-nowrap px-4 py-3 text-sm font-semibold ${aba === key ? "border-b-2 border-blue-700 text-blue-700" : "text-slate-500 hover:text-slate-800"}`}>{label}</button>)}</nav>
    {aba === "visao" && <><div className="grid gap-6 lg:grid-cols-3"><section className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-6"><h2 className="font-bold text-slate-900">Situação da demanda</h2><dl className="mt-5 grid gap-5 sm:grid-cols-2 text-sm"><div className="sm:col-span-2"><dt className="flex items-center gap-2 text-xs text-slate-500">Resumo executivo{podeEditar && <button onClick={regerarResumo} title="Regerar a partir do andamento registrado" className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"><RefreshCw className="h-3 w-3"/>regerar</button>}</dt><dd className="mt-1 font-medium text-slate-800">{demanda.resumo_executivo || "Ainda não registrado"}</dd></div><Dado label="Tipo" value={demanda.tipo?.rotulo || "Não classificado"}/><Dado label="Aguardando" value={demanda.aguardando_terceiro || "Nenhuma pendência externa"}/><Dado label="Última movimentação" value={formatDate(demanda.ultima_movimentacao_em)}/></dl></section><section className="rounded-xl border border-amber-200 bg-amber-50 p-6"><ShieldAlert className="h-5 w-5 text-amber-700"/><h2 className="mt-3 font-bold text-amber-950">Ponto de atenção</h2><p className="mt-2 text-sm text-amber-800">{demanda.bloqueio_motivo || (demanda.atrasada ? "O prazo final foi ultrapassado." : "Nenhum bloqueio registrado.")}</p></section></div><IASugestoes demandaId={id} podeEditar={podeEditar} onAplicar={aplicarSugestao}/><EdicaoDemanda demanda={demanda} podeEditar={podeEditar} onAtualizada={setDemanda}/></>}
    {aba === "tarefas" && <section className="overflow-hidden rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">{tarefas.length ? tarefas.map(t => <div key={t.id} className="flex items-center gap-4 p-5"><div className={`h-2.5 w-2.5 rounded-full ${t.atrasada ? "bg-red-600" : "bg-blue-600"}`}/><div className="min-w-0 flex-1"><p className="font-semibold text-slate-800">{t.titulo}</p><p className="mt-1 text-xs text-slate-500">{t.setor_destino?.nome || "Sem setor"} · {t.atribuida_a?.name || "Sem responsável"}</p></div><div className="text-right"><p className="text-xs font-semibold text-slate-700">{t.status.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-slate-500">{t.prazo ? formatDate(t.prazo) : "Sem prazo"}</p></div></div>) : <p className="p-10 text-center text-sm text-slate-500">Nenhuma tarefa foi criada ainda.</p>}</section>}
    {aba === "documentos" && <DocumentosDemandaTab demandaId={id} podeEditar={podeEditar}/>}
    {aba === "checklists" && <ChecklistsTab demandaId={id} podeEditar={podeEditar}/>}
    {aba === "gestao" && <GestaoTab demandaId={id} podeEditar={podeEditar}/>}
    {aba === "obras" && <ObrasDemandaTab demandaId={id} podeEditar={podeEngenharia}/>}
    {aba === "protocolos" && <ProtocolosTab demandaId={id} podeEditar={podeEditar}/>}
    {aba === "financeiro" && <FinanceiroDemandaTab demandaId={id} podeLancar={podeLancar}/>}
    {aba === "comentarios" && <ComentariosTab demandaId={id} usuarioId={user?.id} podeFixar={podeEditar}/>}
    {aba === "timeline" && <section className="rounded-xl border border-slate-200 bg-white p-6"><div className="space-y-6">{eventos.length ? eventos.map(e => <div key={e.id} className="relative border-l border-slate-200 pl-6"><span className="absolute -left-1.5 top-1 h-3 w-3 rounded-full bg-blue-600"/><p className="text-sm font-medium text-slate-800">{e.descricao}</p><p className="mt-1 text-xs text-slate-500">{e.ator?.name || "Sistema"} · {formatDate(e.ocorrido_em)}</p></div>) : <p className="text-sm text-slate-500">Ainda não há eventos.</p>}</div></section>}
  </div>;
}
function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="flex gap-3"><span className="text-blue-700 [&>svg]:h-4 [&>svg]:w-4">{icon}</span><div><p className="text-xs text-slate-500">{label}</p><p className="mt-0.5 text-sm font-semibold text-slate-800">{value}</p></div></div>; }
function Dado({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-medium text-slate-800">{value}</dd></div>; }
