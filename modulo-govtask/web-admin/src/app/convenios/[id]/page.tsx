"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stepper } from "@/components/ui/Stepper";
import { Tabs } from "@/components/ui/Tabs";
import { Timeline } from "@/components/ui/Timeline";
import { StatusPill } from "@/components/ui/StatusPill";
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
  daysUntil,
  prazoColor,
  prazoBgColor,
  STATUS_LABELS,
  TIPO_CONVENIO_LABELS,
  NATUREZA_ETAPA_LABELS,
  CATEGORIA_RECURSO_LABELS,
  ESFERA_LABELS,
  PRIORIDADE_PROCESSO_LABELS,
  SITUACAO_PROCESSO_LABELS,
} from "@/lib/utils";
import type {
  Convenio,
  Etapa,
  TimelineEvent,
  Anexo,
  TarefaListItem,
} from "@/types/govtask";
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
import {
  Edit,
  FileText,
  Plus,
  RefreshCw,
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  Send,
  RotateCcw,
  X,
  Printer,
} from "lucide-react";

export default function ConvenioDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { hasRole, hasPermission } = useAuth();

  const [convenio, setConvenio] = useState<Convenio | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [tarefas, setTarefas] = useState<TarefaListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("visao-geral");
  const [timelineTipos, setTimelineTipos] = useState<string[] | undefined>();
  const [tarefaStatusFilter, setTarefaStatusFilter] = useState("");
  const [confirmDeleteAnexo, setConfirmDeleteAnexo] = useState<string | null>(null);

  const [etapaEncaminhar, setEtapaEncaminhar] = useState<string | null>(null);
  const [observacaoGoverno, setObservacaoGoverno] = useState("");
  const [etapaResponder, setEtapaResponder] = useState<string | null>(null);
  const [respostaGoverno, setRespostaGoverno] = useState("");
  const [confirmConcluirEtapa, setConfirmConcluirEtapa] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, tl, t] = await Promise.all([
        api.getConvenio(id),
        api.getTimeline(id),
        api.listTarefas({ convenio_id: id, limit: 100 }),
      ]);
      setConvenio(c as unknown as Convenio);
      setTimeline(tl as unknown as TimelineEvent[]);
      setTarefas(t as unknown as TarefaListItem[]);
    } catch (e: any) {
      console.error(e);
      setError(e.message || "Erro ao carregar convênio");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get("tab");
      if (tab && ["visao-geral", "etapas", "tarefas", "documentos", "timeline", "diligencias", "financeiro", "repasses", "medicoes", "obras", "prestacoes", "contratos", "licitacoes", "entregas", "configuracoes"].includes(tab)) {
        setActiveTab(tab);
      }
    }
  }, []);

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

  const handleDeleteAnexo = async () => {
    if (!confirmDeleteAnexo) return;
    try {
      await api.deleteAnexo(confirmDeleteAnexo);
      notify.success("Documento removido!");
      setConfirmDeleteAnexo(null);
      load();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const canEdit = hasRole("ASSESSOR", "ADMIN");
  const isRascunho = convenio?.status === "RASCUNHO";
  const hasNoEtapas = !convenio?.etapas || convenio.etapas.length === 0;
  const showEmptyFlow = hasNoEtapas;
  const actionNeeded = getActionNeeded(convenio);

  const filteredTarefas = tarefaStatusFilter
    ? tarefas.filter((t) => t.status === tarefaStatusFilter)
    : tarefas;

  const etapas = (convenio?.etapas || []).slice().sort((a, b) => a.ordem - b.ordem);

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title=""
          breadcrumbs={[
            { label: "Convênios", href: "/convenios" },
            { label: "..." },
          ]}
        />
        <Skeleton variant="card" className="h-40" />
        <div className="flex gap-2">
          <div className="skeleton h-10 w-24 rounded-btn" />
          <div className="skeleton h-10 w-24 rounded-btn" />
          <div className="skeleton h-10 w-24 rounded-btn" />
          <div className="skeleton h-10 w-24 rounded-btn" />
        </div>
        <Skeleton variant="card" className="h-64" />
      </div>
    );
  }

  if (error || !convenio) {
    return (
      <div className="space-y-6">
        <PageHeader
          title=""
          breadcrumbs={[
            { label: "Convênios", href: "/convenios" },
            { label: "Convênio" },
          ]}
        />
        <Card padding="p-8">
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-[#FEE4E2] flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-6 h-6 text-[#B42318]" />
            </div>
            <h3 className="text-h3 text-text-title mb-1">
              {error || "Convênio não encontrado"}
            </h3>
            <p className="text-body-sm text-text-body mb-4">
              Não foi possível carregar os dados do convênio.
            </p>
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

  const tabs = [
    { key: "visao-geral", label: "Visão Geral" },
    { key: "etapas", label: "Etapas", count: etapas.length },
    { key: "tarefas", label: "Tarefas", count: tarefas.length },
    { key: "documentos", label: "Documentos", count: (convenio?.anexos || []).length },
    { key: "diligencias", label: "Diligências" },
    { key: "financeiro", label: "Financeiro" },
    { key: "repasses", label: "Repasses" },
    { key: "medicoes", label: "Medições" },
    { key: "obras", label: "Obras" },
    { key: "prestacoes", label: "Prestações" },
    { key: "contratos", label: "Contratos" },
    { key: "licitacoes", label: "Licitações" },
    { key: "entregas", label: "Entregas" },
    { key: "configuracoes", label: "Configurações" },
    { key: "timeline", label: "Linha do Tempo", count: timeline.length },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Processo"
        title={convenio.titulo}
        description={`${TIPO_CONVENIO_LABELS[convenio.tipo] || convenio.tipo}${
          convenio.origem ? ` — ${convenio.origem}` : ""
        }`}
        breadcrumbs={[
          { label: "Convênios", href: "/convenios" },
          { label: convenio.titulo },
        ]}
        actions={
          <div className="flex items-center gap-2">
            {canEdit && (
              <Link href={`/convenios/${id}/editar`}>
                <Button variant="secondary" icon={Edit} size="sm">
                  Editar
                </Button>
              </Link>
            )}
            {canEdit && hasPermission("resource.delete") && (
              <Button
                variant="danger"
                icon={X}
                size="sm"
                onClick={() => setConfirmDelete(true)}
              >
                Excluir
              </Button>
            )}
            {canEdit && !convenio.numero_protocolo_governo && (
              <Button
                variant="secondary"
                icon={FileText}
                size="sm"
                onClick={async () => {
                  const proto = prompt("Número do protocolo do governo:");
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
              >
                Registrar Protocolo
              </Button>
            )}
            {canEdit && (
              <Link href={`/convenios/${id}/tarefas/nova`}>
                <Button icon={Plus} size="sm">
                  Criar Tarefa
                </Button>
              </Link>
            )}
            <Link href={`/convenios/${id}/impressao`} title="Imprimir / Dossiê do processo">
              <Button variant="secondary" size="sm" icon={Printer}>
                Imprimir
              </Button>
            </Link>
          </div>
        }
      />

      {showEmptyFlow && canEdit && (
        <Card padding="p-8">
          <EmptyState
            icon="clipboard-list"
            title="Convênio sem etapas"
            description="Este convênio ainda não possui etapas. Sem etapas não é possível criar tarefas ou dar andamento ao fluxo."
            action={{ label: "Editar convênio e adicionar template", href: `/convenios/${id}/editar` }}
          />
        </Card>
      )}
      {showEmptyFlow && !canEdit && (
        <Card padding="p-8">
          <EmptyState
            icon="clipboard-list"
            title="Convênio sem etapas"
            description="Este convênio ainda não possui etapas definidas. Aguarde o assessor configurar o fluxo."
          />
        </Card>
      )}

      {actionNeeded && (
        <div className="bg-[#FEF0C7] border border-[#FDB022] rounded-card p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[#B54708] shrink-0 mt-0.5" />
          <div>
            <p className="text-body-sm font-medium text-[#B54708]">Ação necessária agora:</p>
            <p className="text-body-sm text-[#B54708]/80 mt-0.5">{actionNeeded}</p>
          </div>
        </div>
      )}

      {etapas.length > 0 && (
        <Card padding="p-4">
          <Stepper
            steps={etapas.map((etapa) => ({
              nome: etapa.nome,
              status: etapa.status,
              onClick: () => {
                setActiveTab("etapas");
                setTimeout(() => {
                  const el = document.getElementById(`etapa-${etapa.id}`);
                  if (el) el.scrollIntoView({ behavior: "smooth" });
                }, 100);
              },
            }))}
            currentIndex={etapas.findIndex((e) => e.status === "EM_ANDAMENTO")}
          />
        </Card>
      )}

      <div>
        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

        <div className="mt-6">
          {/* Visão Geral */}
          {activeTab === "visao-geral" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Card padding="p-4">
                  <p className="text-meta text-text-subtle">Valor</p>
                  <p className="text-h2 text-text-title tabular-nums mt-1">
                    {formatCurrency(convenio.valor)}
                  </p>
                </Card>
                <Card padding="p-4">
                  <p className="text-meta text-text-subtle">Protocolo</p>
                  <p className="text-h2 text-text-title mt-1">
                    {convenio.numero_protocolo_governo || "—"}
                  </p>
                </Card>
                <Card padding="p-4">
                  <p className="text-meta text-text-subtle">Responsável</p>
                  <p className="text-h2 text-text-title mt-1">
                    {convenio.responsavel?.name || "—"}
                  </p>
                </Card>
                <Card padding="p-4">
                  <p className="text-meta text-text-subtle">Status</p>
                  <div className="mt-1">
                    <StatusPill status={convenio.status} />
                  </div>
                </Card>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card padding="p-4">
                  <p className="text-meta text-text-subtle">Data de Protocolo</p>
                  <p className="text-body-sm text-text-title mt-1">
                    {formatDate(convenio.data_protocolo)}
                  </p>
                </Card>
                <Card padding="p-4">
                  <p className="text-meta text-text-subtle">Criado em</p>
                  <p className="text-body-sm text-text-title mt-1">
                    {formatDate(convenio.created_at)}
                  </p>
                </Card>
              </div>

              {(convenio.categoria || convenio.esfera || convenio.situacao || convenio.parlamentar || convenio.orgao_concedente) && (
                <Card padding="p-6">
                  <h3 className="text-h3 text-text-title mb-3">Origem do Recurso</h3>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {convenio.categoria && (
                      <Badge label={CATEGORIA_RECURSO_LABELS[convenio.categoria] || convenio.categoria} color="bg-[#1D4ED8]/10 text-[#1D4ED8]" />
                    )}
                    {convenio.esfera && (
                      <Badge label={ESFERA_LABELS[convenio.esfera] || convenio.esfera} color="bg-[#067647]/10 text-[#067647]" />
                    )}
                    {convenio.situacao && (
                      <Badge label={SITUACAO_PROCESSO_LABELS[convenio.situacao] || convenio.situacao} color="bg-[#B54708]/10 text-[#B54708]" />
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-body-sm">
                    {convenio.parlamentar && (
                      <div><span className="text-meta text-text-subtle">Parlamentar: </span><span className="text-text-title">{convenio.parlamentar}{convenio.partido ? ` (${convenio.partido})` : ""}</span></div>
                    )}
                    {convenio.orgao_concedente && (
                      <div><span className="text-meta text-text-subtle">Órgão Concedente: </span><span className="text-text-title">{convenio.orgao_concedente}</span></div>
                    )}
                    {convenio.programa && (
                      <div><span className="text-meta text-text-subtle">Programa: </span><span className="text-text-title">{convenio.programa}</span></div>
                    )}
                    {convenio.numero_emenda && (
                      <div><span className="text-meta text-text-subtle">Emenda: </span><span className="text-text-title">{convenio.numero_emenda}</span></div>
                    )}
                    {convenio.numero_convenio && (
                      <div><span className="text-meta text-text-subtle">Convênio: </span><span className="text-text-title">{convenio.numero_convenio}</span></div>
                    )}
                    {convenio.numero_proposta && (
                      <div><span className="text-meta text-text-subtle">Proposta: </span><span className="text-text-title">{convenio.numero_proposta}</span></div>
                    )}
                    {convenio.vigencia_inicio && convenio.vigencia_fim && (
                      <div><span className="text-meta text-text-subtle">Vigência: </span><span className="text-text-title">{formatDate(convenio.vigencia_inicio)} a {formatDate(convenio.vigencia_fim)}</span></div>
                    )}
                    {convenio.previsao_conclusao && (
                      <div><span className="text-meta text-text-subtle">Previsão conclusão: </span><span className="text-text-title">{formatDate(convenio.previsao_conclusao)}</span></div>
                    )}
                    {convenio.prazo_prestacao_contas && (
                      <div><span className="text-meta text-text-subtle">Prazo prestação: </span><span className="text-text-title">{formatDate(convenio.prazo_prestacao_contas)}</span></div>
                    )}
                  </div>
                  {convenio.finalidade && (
                    <p className="text-body-sm text-text-body mt-3">{convenio.finalidade}</p>
                  )}
                </Card>
              )}

              <Card padding="p-6">
                <h3 className="text-h3 text-text-title mb-3">Descrição</h3>
                <p className="text-body-sm text-text-body whitespace-pre-wrap">
                  {convenio.descricao || "Nenhuma descrição informada."}
                </p>
              </Card>

              {etapas.length > 0 && (
                <Card padding="p-6">
                  <h3 className="text-h3 text-text-title mb-3">Próximos Prazos</h3>
                  <div className="space-y-3">
                    {etapas
                      .filter((e) => e.prazo_governo && e.status !== "CONCLUIDA")
                      .map((e) => {
                        const dias = daysUntil(e.prazo_governo!);
                        return (
                          <div
                            key={e.id}
                            className="flex items-center justify-between p-3 bg-[#F6F7F9] rounded-btn"
                          >
                            <div>
                              <p className="text-body-sm font-medium text-text-title">
                                {e.nome}
                              </p>
                              <p className="text-meta text-text-subtle">
                                Prazo do governo: {formatDate(e.prazo_governo)}
                              </p>
                            </div>
                            <span className={`px-2 py-1 rounded-pill text-meta font-medium ${prazoBgColor(dias)}`}>
                              {dias < 0
                                ? `${Math.abs(dias)} dia(s) atrasado`
                                : dias === 0
                                  ? "Vence hoje"
                                  : `${dias} dia(s)`}
                            </span>
                          </div>
                        );
                      })}
                    {etapas.filter((e) => e.prazo_governo && e.status !== "CONCLUIDA").length === 0 && (
                      <p className="text-body-sm text-text-subtle text-center py-4">
                        Nenhum prazo pendente
                      </p>
                    )}
                  </div>
                </Card>
              )}

              <Card padding="p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-h3 text-text-title">Tarefas Recentes</h3>
                  <button
                    onClick={() => setActiveTab("tarefas")}
                    className="text-body-sm text-[#1D4ED8] hover:underline"
                  >
                    Ver todas ({tarefas.length})
                  </button>
                </div>
                {tarefas.length === 0 ? (
                  <p className="text-body-sm text-text-subtle text-center py-4">
                    Nenhuma tarefa criada
                  </p>
                ) : (
                  <div className="space-y-2">
                    {tarefas.slice(0, 5).map((t) => (
                      <Link
                        key={t.id}
                        href={`/tarefas/${t.id}`}
                        className="flex items-center justify-between p-3 rounded-btn hover:bg-[#F6F7F9] border border-surface-border transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-body-sm font-medium text-text-title truncate">
                            {t.titulo}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <PriorityBadge priority={t.prioridade} />
                            {t.prazo && (
                              <span className={`text-meta flex items-center gap-1 ${prazoColor(daysUntil(t.prazo))}`}>
                                <Clock className="w-3 h-3" />
                                {formatDate(t.prazo)}
                              </span>
                            )}
                            {t.atrasada && (
                              <span className="text-meta text-[#B42318] font-medium">Atrasada</span>
                            )}
                          </div>
                        </div>
                        <StatusPill status={t.status} />
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}

          {/* Etapas */}
          {activeTab === "etapas" && (
            <div className="space-y-4">
              {etapas.length === 0 ? (
                <EmptyState
                  icon="clipboard-list"
                  title="Nenhuma etapa definida"
                  description="Este convênio ainda não possui etapas de fluxo."
                />
              ) : (
                etapas.map((etapa) => (
                  <div key={etapa.id} id={`etapa-${etapa.id}`}>
                    <Card padding="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#F6F7F9] flex items-center justify-center text-label font-medium text-text-title">
                            {etapa.ordem}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-body font-semibold text-text-title">
                                {etapa.nome}
                              </h3>
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
                            <div className="flex items-center gap-4 mt-1 text-meta text-text-subtle">
                              {etapa.prazo_governo && (
                                <span>Prazo governo: {formatDate(etapa.prazo_governo)}</span>
                              )}
                              {etapa.data_inicio && (
                                <span>Início: {formatDate(etapa.data_inicio)}</span>
                              )}
                              {etapa.data_conclusao && (
                                <span>Conclusão: {formatDate(etapa.data_conclusao)}</span>
                              )}
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
                              <Button
                                variant="secondary"
                                size="sm"
                                icon={Send}
                                onClick={() => setEtapaEncaminhar(etapa.id)}
                              >
                                Encaminhar
                              </Button>
                            )}
                            {etapa.status === "AGUARDANDO_GOVERNO" && (
                              <Button
                                variant="secondary"
                                size="sm"
                                icon={RotateCcw}
                                onClick={() => setEtapaResponder(etapa.id)}
                              >
                                Registrar Resposta
                              </Button>
                            )}
                            {(etapa.status === "EM_ANDAMENTO" || etapa.status === "AGUARDANDO_GOVERNO") && (
                              <Button
                                variant="primary"
                                size="sm"
                                icon={CheckCircle}
                                onClick={() => setConfirmConcluirEtapa(etapa.id)}
                              >
                                Concluir
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                      {etapa.tarefas && etapa.tarefas.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-surface-border">
                          <p className="text-label text-text-subtle mb-2">
                            Tarefas ({etapa.tarefas.length})
                          </p>
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

          {/* Tarefas */}
          {activeTab === "tarefas" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-1">
                  {["", "AGUARDANDO_ACEITE", "EM_ANDAMENTO", "ENTREGUE", "DEVOLVIDA", "CONCLUIDA", "CANCELADA"].map(
                    (s) => (
                      <button
                        key={s}
                        onClick={() => setTarefaStatusFilter(s)}
                        className={`px-3 py-1 text-meta rounded-pill border transition-colors ${
                          tarefaStatusFilter === s
                            ? "bg-[#1D4ED8]/10 text-[#1D4ED8] border-[#1D4ED8]/30"
                            : "bg-white text-text-subtle border-surface-border hover:border-text-subtle"
                        }`}
                      >
                        {s ? STATUS_LABELS[s] || s : "Todas"}
                      </button>
                    )
                  )}
                </div>
                {canEdit && !hasNoEtapas && (
                  <Link href={`/convenios/${id}/tarefas/nova`}>
                    <Button icon={Plus} size="sm">
                      Nova Tarefa
                    </Button>
                  </Link>
                )}
              </div>
              {filteredTarefas.length === 0 ? (
                <EmptyState
                  icon="inbox"
                  title="Nenhuma tarefa encontrada"
                  description={
                    tarefaStatusFilter ? "Nenhuma tarefa com este status" : "Este convênio ainda não possui tarefas"
                  }
                />
              ) : (
                <div className="space-y-2">
                  {filteredTarefas.map((t) => (
                    <Link
                      key={t.id}
                      href={`/tarefas/${t.id}`}
                      className="block p-4 rounded-card bg-surface-card border border-surface-border hover:shadow-card transition-shadow"
                    >
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-body-sm font-medium text-text-title truncate">
                            {t.titulo}
                          </p>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <PriorityBadge priority={t.prioridade} />
                            {t.prazo && (
                              <span className={`text-meta flex items-center gap-1 ${prazoColor(daysUntil(t.prazo))}`}>
                                <Clock className="w-3 h-3" />
                                Prazo: {formatDate(t.prazo)}
                              </span>
                            )}
                            {t.atrasada && (
                              <span className="text-meta text-[#B42318] font-medium flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                Atrasada
                              </span>
                            )}
                            {t.atribuida_a && (
                              <span className="text-meta text-text-subtle">{t.atribuida_a.name}</span>
                            )}
                            {t.etapa && (
                              <Badge label={t.etapa.nome} color="bg-[#1D4ED8]/10 text-[#1D4ED8]" />
                            )}
                          </div>
                        </div>
                        <StatusPill status={t.status} className="shrink-0" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Documentos */}
          {activeTab === "documentos" && (
            <DocumentosTab
              convenioId={id}
              anexos={(convenio?.anexos || []) as Anexo[]}
              canEdit={canEdit}
              onRefresh={load}
            />
          )}

          {/* Diligências */}
          {activeTab === "diligencias" && (
            <DiligenciasTab convenioId={id} canEdit={canEdit} />
          )}

          {/* Financeiro */}
          {activeTab === "financeiro" && (
            <FinanceiroTab convenioId={id} canEdit={canEdit} />
          )}

          {/* Repasses */}
          {activeTab === "repasses" && (
            <RepassesTab convenioId={id} canEdit={canEdit} />
          )}

          {/* Medições */}
          {activeTab === "medicoes" && (
            <MedicoesTab convenioId={id} canEdit={canEdit} />
          )}

          {/* Obras */}
          {activeTab === "obras" && (
            <ObrasTab convenioId={id} canEdit={canEdit} />
          )}

          {/* Prestações */}
          {activeTab === "prestacoes" && (
            <PrestacoesTab convenioId={id} canEdit={canEdit} />
          )}

          {/* Contratos */}
          {activeTab === "contratos" && (
            <ContratosTab convenioId={id} canEdit={canEdit} />
          )}

          {/* Licitações */}
          {activeTab === "licitacoes" && (
            <LicitacoesTab convenioId={id} canEdit={canEdit} />
          )}

          {/* Entregas */}
          {activeTab === "entregas" && (
            <EntregasTab convenioId={id} canEdit={canEdit} />
          )}

          {/* Configurações */}
          {activeTab === "configuracoes" && (
            <ConfiguracoesTab convenioId={id} convenio={convenio} canEdit={canEdit} onRefresh={load} />
          )}

          {/* Linha do Tempo */}
          {activeTab === "timeline" && (
            <Card padding="p-6">
              <Timeline events={timeline} tipos={timelineTipos} onFilterChange={setTimelineTipos} />
            </Card>
          )}
        </div>
      </div>

      {/* Etapa Encaminhar modal */}
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

      {/* Etapa Registrar Resposta modal */}
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
        open={!!confirmDeleteAnexo}
        onClose={() => setConfirmDeleteAnexo(null)}
        onConfirm={handleDeleteAnexo}
        title="Excluir documento"
        message="Tem certeza que deseja excluir este documento? Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        destructive
      />
      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setDeleting(true);
          try {
            await api.deleteConvenio(id);
            notify.success("Convênio excluído com sucesso!");
            router.push("/convenios");
          } catch (e: any) {
            notify.error(e.message || "Erro ao excluir convênio");
          } finally {
            setDeleting(false);
            setConfirmDelete(false);
          }
        }}
        title="Excluir convênio"
        message="Tem certeza que deseja excluir este convênio? Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        loading={deleting}
      />
    </div>
  );
}

function getActionNeeded(convenio: Convenio | null): string | null {
  if (!convenio) return null;
  if (convenio.status === "RASCUNHO") return "Convênio está em rascunho. Adicione etapas para iniciar o fluxo.";
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
