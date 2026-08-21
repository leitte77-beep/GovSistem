"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PERM, abasDoProcesso } from "@/lib/perfil";
import { EncaminharDemanda } from "@/components/EncaminharDemanda";
import { Stepper } from "@/components/ui/Stepper";
import { StatusPill } from "@/components/ui/StatusPill";
import { SituacaoPill } from "@/components/ui/SituacaoPill";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { notify } from "@/components/ui/Toast";
import {
  formatDate,
  formatCurrency,
  formatDayTime,
  cn,
  pct,
  pctLabel,
  CATEGORIA_RECURSO_LABELS,
  TIPO_CONVENIO_LABELS,
  NATUREZA_ETAPA_LABELS,
  ESFERA_LABELS,
} from "@/lib/utils";
import type { Convenio, Etapa, TimelineEvent, Anexo, TarefaListItem } from "@/types/govtask";
import { DiligenciasTab } from "@/components/recursos/DiligenciasTab";
import { FinanceiroTab } from "@/components/recursos/FinanceiroTab";
import { RepassesTab } from "@/components/recursos/RepassesTab";
import { MedicoesTab } from "@/components/recursos/MedicoesTab";
import { PrestacoesTab } from "@/components/recursos/PrestacoesTab";
import { ContratosTab } from "@/components/recursos/ContratosTab";
import { LicitacoesTab } from "@/components/recursos/LicitacoesTab";
import { EntregasTab } from "@/components/recursos/EntregasTab";
import { DocumentosTab } from "@/components/recursos/DocumentosTab";
import { ObrasTab } from "@/components/recursos/ObrasTab";
import { ConfiguracoesTab } from "@/components/recursos/ConfiguracoesTab";
import { TimelineTab } from "@/components/recursos/TimelineTab";
import { TarefasTab } from "@/components/recursos/TarefasTab";
import {
  Edit,
  FileText,
  Plus,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Send,
  RotateCcw,
  Star,
  Printer,
  MoreHorizontal,
  ChevronRight,
  Trash2,
  ChevronDown,
  CheckCircle2,
} from "lucide-react";

/** Abas visíveis na barra principal, na ordem da tela de processo. */
const TABS_PRINCIPAIS = [
  { key: "visao-geral", label: "Visão Geral" },
  { key: "timeline", label: "Timeline" },
  { key: "tarefas", label: "Tarefas" },
  { key: "diligencias", label: "Diligências" },
  { key: "documentos", label: "Documentos" },
  { key: "financeiro", label: "Financeiro" },
  { key: "prestacoes", label: "Prestação de Contas" },
  { key: "obras", label: "Obras" },
];

/** Abas complementares, acessíveis pelo menu "Mais". */
const TABS_EXTRAS = [
  { key: "etapas", label: "Etapas" },
  { key: "repasses", label: "Repasses" },
  { key: "medicoes", label: "Medições" },
  { key: "contratos", label: "Contratos" },
  { key: "licitacoes", label: "Licitações" },
  { key: "entregas", label: "Entregas" },
  { key: "configuracoes", label: "Configurações" },
];

const TODAS_AS_ABAS = [...TABS_PRINCIPAIS, ...TABS_EXTRAS].map((t) => t.key);

export default function ConvenioDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, hasPermission } = useAuth();

  const [convenio, setConvenio] = useState<Convenio | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [tarefas, setTarefas] = useState<TarefaListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("visao-geral");
  const [favorito, setFavorito] = useState(false);
  const [showAcoes, setShowAcoes] = useState(false);
  const [showMais, setShowMais] = useState(false);
  const acoesRef = useRef<HTMLDivElement>(null);
  const maisRef = useRef<HTMLDivElement>(null);

  const [etapaEncaminhar, setEtapaEncaminhar] = useState<string | null>(null);
  const [observacaoGoverno, setObservacaoGoverno] = useState("");
  const [etapaResponder, setEtapaResponder] = useState<string | null>(null);
  const [respostaGoverno, setRespostaGoverno] = useState("");
  const [confirmConcluirEtapa, setConfirmConcluirEtapa] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [encaminharAberto, setEncaminharAberto] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, tl, t] = await Promise.all([
        api.getConvenio(id),
        api.getTimeline(id),
        api.listTarefas({ convenio_id: id, limit: 200 }),
      ]);
      setConvenio(c as unknown as Convenio);
      setTimeline(tl as unknown as TimelineEvent[]);
      setTarefas(t as unknown as TarefaListItem[]);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Erro ao carregar processo");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.listFavoritos()
      .then((favs) => setFavorito(favs.some((f) => f.id === id)))
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab && TODAS_AS_ABAS.includes(tab)) setActiveTab(tab);
  }, []);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (acoesRef.current && !acoesRef.current.contains(e.target as Node)) setShowAcoes(false);
      if (maisRef.current && !maisRef.current.contains(e.target as Node)) setShowMais(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const toggleFavorito = async () => {
    const novo = !favorito;
    setFavorito(novo);
    try {
      if (novo) await api.favoritar(id);
      else await api.desfavoritar(id);
    } catch (e: any) {
      setFavorito(!novo);
      notify.error(e.message || "Não foi possível atualizar o favorito");
    }
  };

  const handleEncaminharGoverno = async () => {
    if (!etapaEncaminhar) return;
    try {
      await api.encaminharGoverno(etapaEncaminhar, observacaoGoverno || undefined);
      notify.success("Etapa encaminhada ao governo!");
      setEtapaEncaminhar(null);
      setObservacaoGoverno("");
      load();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const handleResponderGoverno = async () => {
    if (!etapaResponder) return;
    try {
      await api.registrarRespostaGoverno(etapaResponder, respostaGoverno);
      notify.success("Resposta registrada!");
      setEtapaResponder(null);
      setRespostaGoverno("");
      load();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const handleConcluirEtapa = async () => {
    if (!confirmConcluirEtapa) return;
    try {
      await api.concluirEtapa(confirmConcluirEtapa);
      notify.success("Etapa concluída!");
      setConfirmConcluirEtapa(null);
      load();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const canEdit = hasPermission(PERM.EDIT);
  const podeVerFinanceiro = hasPermission(PERM.FINANCIAL_VIEW, PERM.FINANCIAL_MANAGE);
  const canEncaminhar = hasPermission(PERM.TASK_ASSIGN);
  const etapas = (convenio?.etapas || []).slice().sort((a, b) => a.ordem - b.ordem);
  const actionNeeded = getActionNeeded(convenio);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton variant="text" className="h-4 w-72" />
        <Skeleton variant="card" className="h-56" />
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-10 w-24 rounded-btn" />
          ))}
        </div>
        <Skeleton variant="card" className="h-64" />
      </div>
    );
  }

  if (error || !convenio) {
    return (
      <div className="space-y-6">
        <Breadcrumb titulo="Processo" />
        <Card padding="p-8">
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-[#FEE4E2] flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-6 h-6 text-[#B42318]" />
            </div>
            <h3 className="text-h3 text-text-title mb-1">{error || "Processo não encontrado"}</h3>
            <p className="text-body-sm text-text-body mb-4">Não foi possível carregar os dados do processo.</p>
            <div className="flex gap-3 justify-center">
              <Button variant="secondary" onClick={() => router.push("/convenios")}>
                Voltar para lista
              </Button>
              <Button icon={RefreshCw} onClick={load}>
                Tentar novamente
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const categoriaLabel = convenio.categoria
    ? CATEGORIA_RECURSO_LABELS[convenio.categoria] || convenio.categoria
    : TIPO_CONVENIO_LABELS[convenio.tipo] || convenio.tipo;

  const tarefasAbertas = tarefas.filter((t) => t.status !== "CONCLUIDA" && t.status !== "CANCELADA");
  const tarefasAtrasadas = tarefasAbertas.filter((t) => t.atrasada);

  // Abas conforme a permissão de quem olha e o que o processo realmente tem:
  // uma aquisição de veículo não abre aba de Obras, e a Engenharia não vê o
  // Financeiro.
  const abasPermitidas = new Set(
    abasDoProcesso(user?.permissions ?? [], {
      temObra: convenio.tipo === "OBRA",
      temLicitacao: Boolean(convenio.numero_convenio) || convenio.tipo === "OBRA",
      temEntrega: convenio.tipo === "AQUISICAO",
    }).map((a) => a.key)
  );
  const tabsPrincipais = TABS_PRINCIPAIS.filter((t) => abasPermitidas.has(t.key));
  const tabsExtras = TABS_EXTRAS.filter((t) => abasPermitidas.has(t.key));
  // Uma aba fora do perfil (ex.: ?tab=financeiro na URL) cai na visão geral.
  const abaAtual = abasPermitidas.has(activeTab) ? activeTab : "visao-geral";
  const abaExtraAtiva = tabsExtras.find((t) => t.key === abaAtual);

  const tabCount = (key: string) => {
    if (key === "tarefas") return tarefas.length;
    if (key === "documentos") return (convenio.anexos || []).length;
    if (key === "etapas") return etapas.length;
    return undefined;
  };

  return (
    <div className="space-y-6">
      <Breadcrumb titulo={convenio.titulo} />

      {/* Cabeçalho do processo */}
      <div className="bg-white border border-[#E4E7EC] rounded-xl p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[12px]">
              <span className="text-[#667085]">{categoriaLabel}</span>
              {convenio.numero_emenda && <span className="text-[#98A2B3]">· {convenio.numero_emenda}</span>}
            </div>
            <h1 className="text-[28px] leading-[36px] font-bold text-[#101828] tracking-tight mt-1.5 break-words">
              {convenio.titulo}
            </h1>
            {convenio.finalidade && (
              <p className="text-[14px] text-[#667085] mt-1">{convenio.finalidade}</p>
            )}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <SituacaoPill situacao={convenio.situacao} status={convenio.status} />
              {convenio.prioridade && <PriorityBadge priority={convenio.prioridade} />}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {canEncaminhar && (
              <button
                type="button"
                onClick={() => setEncaminharAberto(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-[#1D4ED8] text-white px-3.5 py-2.5 text-[13px] font-semibold hover:bg-[#1E40AF] transition-colors mr-1"
              >
                <Send className="w-4 h-4" /> Encaminhar
              </button>
            )}
            <button
              type="button"
              onClick={toggleFavorito}
              className={cn(
                "p-2 rounded-lg transition-colors",
                favorito ? "text-[#F5A524]" : "text-[#D0D5DD] hover:text-[#F5A524]"
              )}
              aria-label={favorito ? "Remover dos favoritos" : "Adicionar aos favoritos"}
            >
              <Star className={cn("w-5 h-5", favorito && "fill-[#F5A524]")} />
            </button>

            <div className="relative" ref={acoesRef}>
              <button
                type="button"
                onClick={() => setShowAcoes((v) => !v)}
                className="p-2 rounded-lg text-[#98A2B3] hover:text-[#475467] hover:bg-[#F9FAFB] transition-colors"
                aria-label="Ações do processo"
              >
                <MoreHorizontal className="w-5 h-5" />
              </button>
              {showAcoes && (
                <div className="absolute right-0 top-full mt-1 w-60 bg-white border border-[#E4E7EC] rounded-xl shadow-elevated z-30 py-1.5">
                  {canEdit && (
                    <Link
                      href={`/convenios/${id}/editar`}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-[#344054] hover:bg-[#F9FAFB] transition-colors"
                    >
                      <Edit className="w-4 h-4" /> Editar processo
                    </Link>
                  )}
                  {canEdit && (
                    <Link
                      href={`/convenios/${id}/tarefas/nova`}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-[#344054] hover:bg-[#F9FAFB] transition-colors"
                    >
                      <Plus className="w-4 h-4" /> Criar tarefa
                    </Link>
                  )}
                  {canEdit && !convenio.numero_protocolo_governo && (
                    <button
                      type="button"
                      onClick={async () => {
                        setShowAcoes(false);
                        const proto = window.prompt("Número do protocolo do governo:");
                        if (!proto) return;
                        try {
                          await api.registrarProtocolo(id, {
                            numero_protocolo: proto,
                            data_protocolo: new Date().toISOString().split("T")[0],
                          });
                          notify.success("Protocolo registrado!");
                          load();
                        } catch (e: any) {
                          notify.error(e.message);
                        }
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-[#344054] hover:bg-[#F9FAFB] transition-colors"
                    >
                      <FileText className="w-4 h-4" /> Registrar protocolo
                    </button>
                  )}
                  <Link
                    href={`/convenios/${id}/impressao`}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-[#344054] hover:bg-[#F9FAFB] transition-colors"
                  >
                    <Printer className="w-4 h-4" /> Imprimir dossiê
                  </Link>
                  {canEdit && hasPermission("resource.delete") && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowAcoes(false);
                        setConfirmDelete(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-[#B42318] hover:bg-[#FEF3F2] transition-colors border-t border-[#F2F4F7] mt-1 pt-2.5"
                    >
                      <Trash2 className="w-4 h-4" /> Excluir processo
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Dados principais */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-y-4 gap-x-6 mt-5">
          {podeVerFinanceiro && (
            <>
              <Dado label="Valor aprovado" valor={formatCurrency(convenio.valor_aprovado ?? convenio.valor)} destaque />
              <Dado label="Valor executado" valor={formatCurrency(convenio.valor_executado)} destaque />
            </>
          )}
          <Dado label="Órgão concedente" valor={convenio.orgao_concedente || "—"} destaque />
          <Dado label="Prazo de execução" valor={formatDate(convenio.prazo_execucao)} destaque />
        </div>

        {/* Progresso — administrativo, físico e financeiro lado a lado */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3 mt-5">
          <BarraProgresso label="Administrativo" valor={convenio.percentual_administrativo} cor="bg-[#9E77ED]" />
          <BarraProgresso label="Físico" valor={convenio.percentual_fisico} cor="bg-[#2E90FA]" />
          {podeVerFinanceiro && (
            <BarraProgresso label="Financeiro" valor={convenio.percentual_financeiro} cor="bg-[#12B76A]" />
          )}
        </div>
      </div>

      {actionNeeded && (
        <div className="bg-[#FFFAEB] border border-[#FEDF89] rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[#B54708] shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-medium text-[#B54708]">Ação necessária agora:</p>
            <p className="text-[13px] text-[#B54708]/80 mt-0.5">{actionNeeded}</p>
          </div>
        </div>
      )}

      {/* Abas */}
      <div>
        <div className="flex items-center border-b border-[#E4E7EC] overflow-x-auto scrollbar-thin">
          {tabsPrincipais.map((tab) => {
            const count = tabCount(tab.key);
            const ativo = abaAtual === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-[14px] font-medium border-b-2 -mb-px whitespace-nowrap transition-colors",
                  ativo
                    ? "border-[#1D4ED8] text-[#1D4ED8]"
                    : "border-transparent text-[#667085] hover:text-[#101828]"
                )}
              >
                {tab.label}
                {count !== undefined && count > 0 && (
                  <span className="text-[12px] text-[#98A2B3] tabular-nums">{count}</span>
                )}
              </button>
            );
          })}

          {/* Abas complementares */}
          <div className="relative ml-auto pl-2" ref={maisRef}>
            <button
              onClick={() => setShowMais((v) => !v)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-3 text-[14px] font-medium border-b-2 -mb-px whitespace-nowrap transition-colors",
                abaExtraAtiva
                  ? "border-[#1D4ED8] text-[#1D4ED8]"
                  : "border-transparent text-[#667085] hover:text-[#101828]"
              )}
            >
              {abaExtraAtiva ? abaExtraAtiva.label : "Mais"}
              <ChevronDown className="w-4 h-4" />
            </button>
            {showMais && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-[#E4E7EC] rounded-xl shadow-elevated z-30 py-1.5">
                {tabsExtras.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => {
                      setActiveTab(tab.key);
                      setShowMais(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-4 py-2.5 text-[13px] hover:bg-[#F9FAFB] transition-colors",
                      abaAtual === tab.key ? "text-[#1D4ED8] font-medium" : "text-[#344054]"
                    )}
                  >
                    {tab.label}
                    {tabCount(tab.key) !== undefined && (
                      <span className="text-[12px] text-[#98A2B3] tabular-nums">{tabCount(tab.key)}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6">
          {/* ── Visão Geral ────────────────────────────────── */}
          {abaAtual === "visao-geral" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8 space-y-6">
                {/* Resumo executivo */}
                <div className="bg-white border border-[#E4E7EC] rounded-xl p-5">
                  <h3 className="text-[15px] font-semibold text-[#101828] mb-4">Resumo executivo</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <MiniCard label="Etapa atual" valor={convenio.etapa_atual || convenio.situacao || "—"} />
                    <MiniCard
                      label="Última movimentação"
                      valor={convenio.ultima_movimentacao ? formatDayTime(convenio.ultima_movimentacao) : "—"}
                    />
                    <MiniCard
                      label="Tarefas abertas"
                      valor={String(convenio.tarefas_abertas ?? tarefasAbertas.length)}
                      icone={<CheckCircle2 className="w-3.5 h-3.5" />}
                    />
                    <MiniCard
                      label="Tarefas atrasadas"
                      valor={String(convenio.tarefas_atrasadas ?? tarefasAtrasadas.length)}
                      icone={<AlertTriangle className="w-3.5 h-3.5" />}
                      alerta={(convenio.tarefas_atrasadas ?? tarefasAtrasadas.length) > 0}
                    />
                  </div>
                </div>

                {/* Progresso do processo */}
                <div className="bg-white border border-[#E4E7EC] rounded-xl p-5">
                  <h3 className="text-[15px] font-semibold text-[#101828] mb-4">Progresso do processo</h3>
                  <div className="space-y-4">
                    <BarraProgresso label="Administrativo" valor={convenio.percentual_administrativo} cor="bg-[#9E77ED]" />
                    <BarraProgresso label="Físico" valor={convenio.percentual_fisico} cor="bg-[#2E90FA]" />
                    <BarraProgresso label="Financeiro" valor={convenio.percentual_financeiro} cor="bg-[#12B76A]" />
                  </div>
                </div>

                {/* Tarefas em andamento */}
                <div className="bg-white border border-[#E4E7EC] rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[15px] font-semibold text-[#101828]">Tarefas em andamento</h3>
                    {tarefas.length > 0 && (
                      <button
                        onClick={() => setActiveTab("tarefas")}
                        className="text-[13px] text-[#1D4ED8] hover:underline font-medium"
                      >
                        Ver todas ({tarefas.length})
                      </button>
                    )}
                  </div>
                  {tarefasAbertas.length === 0 ? (
                    <p className="text-[13px] text-[#98A2B3] py-3">Nenhuma tarefa em andamento</p>
                  ) : (
                    <div className="divide-y divide-[#F2F4F7]">
                      {tarefasAbertas.slice(0, 5).map((t) => (
                        <Link
                          key={t.id}
                          href={`/tarefas/${t.id}`}
                          className="flex items-center justify-between gap-4 py-3 group"
                        >
                          <div className="min-w-0">
                            <p className="text-[14px] font-medium text-[#101828] truncate group-hover:text-[#1D4ED8] transition-colors">
                              {t.titulo}
                            </p>
                            <p className="text-[12px] text-[#98A2B3] mt-0.5">
                              {t.setor_destino?.nome || t.etapa?.nome || "—"} ·{" "}
                              {t.atribuida_a?.name || "Sem responsável"}
                            </p>
                          </div>
                          <span
                            className={cn(
                              "text-[12px] tabular-nums shrink-0",
                              t.atrasada ? "text-[#B42318] font-medium" : "text-[#667085]"
                            )}
                          >
                            {t.prazo ? formatDate(t.prazo) : "—"}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="lg:col-span-4 space-y-6">
                {/* Identificação */}
                <div className="bg-white border border-[#E4E7EC] rounded-xl p-5">
                  <h3 className="text-[15px] font-semibold text-[#101828] mb-4">Identificação</h3>
                  <dl className="space-y-2.5">
                    <Linha label="Tipo" valor={categoriaLabel} />
                    <Linha
                      label="Origem"
                      valor={
                        convenio.esfera
                          ? (ESFERA_LABELS[convenio.esfera] || convenio.esfera).toLowerCase()
                          : convenio.origem || "—"
                      }
                    />
                    <Linha label="Parlamentar" valor={convenio.parlamentar || "—"} />
                    <Linha label="Órgão" valor={convenio.orgao_concedente || "—"} />
                    <Linha label="Programa" valor={convenio.programa || "—"} />
                    <Linha label="Nº emenda" valor={convenio.numero_emenda || "—"} />
                    <Linha label="Nº convênio" valor={convenio.numero_convenio || "—"} />
                    <Linha label="Coordenador" valor={convenio.responsavel?.name || "—"} />
                  </dl>
                </div>

                {/* Financeiro */}
                <div className="bg-white border border-[#E4E7EC] rounded-xl p-5">
                  <h3 className="text-[15px] font-semibold text-[#101828] mb-4">Financeiro</h3>
                  <dl className="space-y-2.5">
                    <Linha label="Aprovado" valor={formatCurrency(convenio.valor_aprovado ?? convenio.valor)} />
                    <Linha label="Recebido" valor={formatCurrency(convenio.valor_recebido)} />
                    <Linha label="Executado" valor={formatCurrency(convenio.valor_executado)} />
                    <Linha label="Pago" valor={formatCurrency(convenio.valor_pago)} />
                  </dl>
                </div>

                {/* Diligências ativas */}
                <div className="bg-white border border-[#E4E7EC] rounded-xl p-5">
                  <h3 className="text-[15px] font-semibold text-[#101828] mb-3">Diligências ativas</h3>
                  {(convenio.pendencias ?? 0) > 0 ? (
                    <button
                      onClick={() => setActiveTab("diligencias")}
                      className="text-[13px] text-[#1D4ED8] hover:underline text-left"
                    >
                      {convenio.pendencias} diligência(s) pendente(s) de atendimento.
                    </button>
                  ) : (
                    <p className="text-[13px] text-[#98A2B3]">Nenhuma diligência ativa.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Timeline ───────────────────────────────────── */}
          {abaAtual === "timeline" && (
            <TimelineTab convenioId={id} events={timeline} onRefresh={load} />
          )}

          {/* ── Tarefas ────────────────────────────────────── */}
          {abaAtual === "tarefas" && (
            <TarefasTab
              convenioId={id}
              tarefas={tarefas}
              etapas={etapas}
              canEdit={canEdit}
              onRefresh={load}
            />
          )}

          {abaAtual === "diligencias" && <DiligenciasTab convenioId={id} canEdit={canEdit} />}

          {abaAtual === "documentos" && (
            <DocumentosTab
              convenioId={id}
              anexos={(convenio.anexos || []) as Anexo[]}
              canEdit={canEdit}
              onRefresh={load}
            />
          )}

          {abaAtual === "financeiro" && <FinanceiroTab convenioId={id} canEdit={canEdit} />}
          {abaAtual === "prestacoes" && <PrestacoesTab convenioId={id} canEdit={canEdit} />}
          {abaAtual === "obras" && <ObrasTab convenioId={id} canEdit={canEdit} />}
          {abaAtual === "repasses" && <RepassesTab convenioId={id} canEdit={canEdit} />}
          {abaAtual === "medicoes" && <MedicoesTab convenioId={id} canEdit={canEdit} />}
          {abaAtual === "contratos" && <ContratosTab convenioId={id} canEdit={canEdit} />}
          {abaAtual === "licitacoes" && <LicitacoesTab convenioId={id} canEdit={canEdit} />}
          {abaAtual === "entregas" && <EntregasTab convenioId={id} canEdit={canEdit} />}
          {abaAtual === "configuracoes" && (
            <ConfiguracoesTab convenioId={id} convenio={convenio} canEdit={canEdit} onRefresh={load} />
          )}

          {/* ── Etapas ─────────────────────────────────────── */}
          {abaAtual === "etapas" && (
            <div className="space-y-4">
              {etapas.length > 0 && (
                <Card padding="p-4">
                  <Stepper
                    steps={etapas.map((etapa) => ({
                      nome: etapa.nome,
                      status: etapa.status,
                      onClick: () => {
                        const el = document.getElementById(`etapa-${etapa.id}`);
                        if (el) el.scrollIntoView({ behavior: "smooth" });
                      },
                    }))}
                    currentIndex={etapas.findIndex((e) => e.status === "EM_ANDAMENTO")}
                  />
                </Card>
              )}
              {etapas.length === 0 ? (
                <EmptyState
                  icon="clipboard-list"
                  title="Nenhuma etapa definida"
                  description="Este processo ainda não possui etapas de fluxo. Sem etapas não é possível criar tarefas."
                  action={canEdit ? { label: "Editar processo", href: `/convenios/${id}/editar` } : undefined}
                />
              ) : (
                etapas.map((etapa) => (
                  <div key={etapa.id} id={`etapa-${etapa.id}`}>
                    <Card padding="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-[#F6F7F9] flex items-center justify-center text-label font-medium text-text-title shrink-0">
                            {etapa.ordem}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-body font-semibold text-text-title">{etapa.nome}</h3>
                              <Badge
                                label={NATUREZA_ETAPA_LABELS[etapa.natureza] || etapa.natureza}
                                color={
                                  etapa.natureza === "GOVERNO"
                                    ? "bg-[#B54708]/10 text-[#B54708]"
                                    : "bg-[#1D4ED8]/10 text-[#1D4ED8]"
                                }
                              />
                              <StatusPill status={etapa.status} />
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-meta text-text-subtle flex-wrap">
                              {etapa.prazo_governo && <span>Prazo governo: {formatDate(etapa.prazo_governo)}</span>}
                              {etapa.data_inicio && <span>Início: {formatDate(etapa.data_inicio)}</span>}
                              {etapa.data_conclusao && <span>Conclusão: {formatDate(etapa.data_conclusao)}</span>}
                            </div>
                            {etapa.resposta_governo && (
                              <p className="text-body-sm text-text-body mt-2 bg-[#F6F7F9] p-2 rounded-btn">
                                Resposta: {etapa.resposta_governo}
                              </p>
                            )}
                          </div>
                        </div>
                        {canEdit && (
                          <div className="flex items-center gap-1 shrink-0">
                            {etapa.natureza === "GOVERNO" && etapa.status === "EM_ANDAMENTO" && (
                              <Button variant="secondary" size="sm" icon={Send} onClick={() => setEtapaEncaminhar(etapa.id)}>
                                Encaminhar
                              </Button>
                            )}
                            {etapa.status === "AGUARDANDO_GOVERNO" && (
                              <Button variant="secondary" size="sm" icon={RotateCcw} onClick={() => setEtapaResponder(etapa.id)}>
                                Registrar Resposta
                              </Button>
                            )}
                            {(etapa.status === "EM_ANDAMENTO" || etapa.status === "AGUARDANDO_GOVERNO") && (
                              <Button size="sm" icon={CheckCircle} onClick={() => setConfirmConcluirEtapa(etapa.id)}>
                                Concluir
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                      {etapa.tarefas && etapa.tarefas.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-surface-border">
                          <p className="text-label text-text-subtle mb-2">Tarefas ({etapa.tarefas.length})</p>
                          <div className="space-y-1">
                            {etapa.tarefas.map((t) => (
                              <Link
                                key={t.id}
                                href={`/tarefas/${t.id}`}
                                className="flex items-center justify-between p-2 rounded-btn hover:bg-[#F6F7F9] text-body-sm"
                              >
                                <span className="text-text-title">{t.titulo}</span>
                                <div className="flex items-center gap-2">
                                  <PriorityBadge priority={t.prioridade} />
                                  <StatusPill status={t.status} />
                                </div>
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                    </Card>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modais de etapa */}
      {etapaEncaminhar && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-card p-6 w-full max-w-md shadow-elevated">
            <h3 className="text-h3 text-text-title mb-4">Encaminhar ao Governo</h3>
            <textarea
              value={observacaoGoverno}
              onChange={(e) => setObservacaoGoverno(e.target.value)}
              placeholder="Observação (opcional)..."
              rows={3}
              className="w-full border border-surface-border rounded-btn px-3 py-2 text-sm bg-white text-text-title placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8] resize-y"
            />
            <div className="flex gap-3 justify-end mt-4">
              <Button
                variant="secondary"
                onClick={() => {
                  setEtapaEncaminhar(null);
                  setObservacaoGoverno("");
                }}
              >
                Cancelar
              </Button>
              <Button icon={Send} onClick={handleEncaminharGoverno}>
                Encaminhar
              </Button>
            </div>
          </div>
        </div>
      )}

      {etapaResponder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-card p-6 w-full max-w-md shadow-elevated">
            <h3 className="text-h3 text-text-title mb-4">Registrar Resposta do Governo</h3>
            <textarea
              value={respostaGoverno}
              onChange={(e) => setRespostaGoverno(e.target.value)}
              placeholder="Resposta recebida do governo..."
              rows={3}
              className="w-full border border-surface-border rounded-btn px-3 py-2 text-sm bg-white text-text-title placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8] resize-y"
            />
            <div className="flex gap-3 justify-end mt-4">
              <Button
                variant="secondary"
                onClick={() => {
                  setEtapaResponder(null);
                  setRespostaGoverno("");
                }}
              >
                Cancelar
              </Button>
              <Button icon={RotateCcw} onClick={handleResponderGoverno}>
                Registrar
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirmConcluirEtapa}
        onClose={() => setConfirmConcluirEtapa(null)}
        onConfirm={handleConcluirEtapa}
        title="Concluir etapa"
        message="Tem certeza que deseja concluir esta etapa? Esta ação não pode ser desfeita."
        confirmLabel="Concluir etapa"
        destructive={false}
      />

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setDeleting(true);
          try {
            await api.deleteConvenio(id);
            notify.success("Processo excluído com sucesso!");
            router.push("/convenios");
          } catch (e: any) {
            notify.error(e.message || "Erro ao excluir processo");
          } finally {
            setDeleting(false);
            setConfirmDelete(false);
          }
        }}
        title="Excluir processo"
        message="Tem certeza que deseja excluir este processo? Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        loading={deleting}
      />

      <EncaminharDemanda
        convenioId={id}
        processoTitulo={convenio.titulo}
        aberto={encaminharAberto}
        onFechar={() => setEncaminharAberto(false)}
        onEncaminhado={load}
      />
    </div>
  );
}

function Breadcrumb({ titulo }: { titulo: string }) {
  const curto = titulo.length > 34 ? `${titulo.slice(0, 34)}...` : titulo;
  return (
    <nav className="flex items-center gap-1.5 text-[13px] text-[#667085]">
      <Link href="/" className="hover:text-[#101828] transition-colors">
        Gestão de Recursos
      </Link>
      <ChevronRight className="w-3.5 h-3.5 text-[#D0D5DD]" />
      <Link href="/convenios" className="hover:text-[#101828] transition-colors">
        Processos
      </Link>
      <ChevronRight className="w-3.5 h-3.5 text-[#D0D5DD]" />
      <span className="text-[#101828] font-medium truncate">{curto}</span>
    </nav>
  );
}

function Dado({ label, valor, destaque }: { label: string; valor: string; destaque?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] text-[#98A2B3]">{label}</p>
      <p className={cn("text-[15px] text-[#101828] mt-0.5 truncate", destaque && "font-semibold tabular-nums")}>
        {valor}
      </p>
    </div>
  );
}

function BarraProgresso({
  label,
  valor,
  cor,
}: {
  label: string;
  valor: number | string | null | undefined;
  cor: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px] text-[#667085]">{label}</span>
        <span className="text-[12px] text-[#475467] tabular-nums">{pctLabel(valor)}%</span>
      </div>
      <div className="h-1.5 bg-[#F2F4F7] rounded-pill overflow-hidden">
        <div className={cn("h-full rounded-pill transition-all duration-700", cor)} style={{ width: `${pct(valor)}%` }} />
      </div>
    </div>
  );
}

function MiniCard({
  label,
  valor,
  icone,
  alerta,
}: {
  label: string;
  valor: string;
  icone?: React.ReactNode;
  alerta?: boolean;
}) {
  return (
    <div className="rounded-lg bg-[#F9FAFB] border border-[#F2F4F7] p-3.5">
      <p className="text-[12px] text-[#98A2B3] flex items-center gap-1.5">
        {icone}
        {label}
      </p>
      <p className={cn("text-[15px] font-semibold text-[#101828] mt-1", alerta && "text-[#B42318]")}>{valor}</p>
    </div>
  );
}

function Linha({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-[13px] text-[#98A2B3] shrink-0">{label}</dt>
      <dd className="text-[13px] text-[#101828] text-right font-medium min-w-0 truncate">{valor}</dd>
    </div>
  );
}

function getActionNeeded(convenio: Convenio | null): string | null {
  if (!convenio) return null;
  if (convenio.status === "RASCUNHO") return "Processo está em rascunho. Adicione etapas para iniciar o fluxo.";
  if (convenio.status === "CANCELADO" || convenio.status === "CONCLUIDO") return null;

  const etapas: Etapa[] = convenio.etapas || [];
  const pendentes = etapas.filter((x: Etapa) => x.status === "PENDENTE");
  const minOrdem = pendentes.length > 0 ? Math.min(...pendentes.map((x: Etapa) => x.ordem)) : Infinity;
  const pendente = minOrdem !== Infinity ? etapas.find((e: Etapa) => e.status === "PENDENTE" && e.ordem === minOrdem) : undefined;
  const emAndamento = etapas.find((e: Etapa) => e.status === "EM_ANDAMENTO");
  const agGov = etapas.find((e: Etapa) => e.status === "AGUARDANDO_GOVERNO");

  if (agGov) return `Aguardando resposta do governo para a etapa "${agGov.nome}"`;
  if (emAndamento) return `Etapa "${emAndamento.nome}" está em andamento`;
  if (pendente) return `Próxima etapa: "${pendente.nome}" precisa ser iniciada`;

  const tarefasPendentes = (convenio.tarefas || []).filter(
    (t: TarefaListItem) => !["CONCLUIDA", "CANCELADA"].includes(t.status)
  );
  if (tarefasPendentes.length > 0) {
    const atrasadas = tarefasPendentes.filter((t: TarefaListItem) => t.atrasada);
    if (atrasadas.length > 0) return `${atrasadas.length} tarefa(s) atrasada(s)`;
    return `${tarefasPendentes.length} tarefa(s) pendente(s)`;
  }

  return null;
}
