"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  formatDate,
  daysUntil,
  prazoColor,
  prazoBgColor,
  STATUS_COLORS,
  STATUS_LABELS,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  NATUREZA_ETAPA_LABELS,
  formatFileSize,
} from "@/lib/utils";
import type { Etapa, TarefaListItem, Anexo } from "@/types/govtask";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { StatusPill } from "@/components/ui/StatusPill";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { notify } from "@/components/ui/Toast";
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Paperclip,
  Send,
  MessageSquare,
  Building2,
  Shield,
  ArrowRight,
} from "lucide-react";

export default function EtapaDetailPage() {
  const { id: convenioId, etapaId } = useParams<{ id: string; etapaId: string }>();
  const router = useRouter();
  const { hasRole } = useAuth();
  const isAssessor = hasRole("ASSESSOR", "ADMIN");

  const [convenio, setConvenio] = useState<{ id: string; titulo: string } | null>(null);
  const [etapa, setEtapa] = useState<Etapa | null>(null);
  const [tarefas, setTarefas] = useState<TarefaListItem[]>([]);
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConcluirModal, setShowConcluirModal] = useState(false);
  const [showEncaminharModal, setShowEncaminharModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [c, e, t] = await Promise.all([
        api.getConvenio(convenioId),
        api.getEtapa(etapaId),
        api.listTarefas({ convenio_id: convenioId }),
      ]);

      setConvenio({ id: c.id, titulo: c.titulo });

      const etapaData = "etapas" in c
        ? (c as any).etapas?.find((ep: any) => ep.id === etapaId)
        : e;

      setEtapa(etapaData);
      setTarefas(t.filter((tf: any) => tf.etapa_id === etapaId || (tf.etapa && tf.etapa.id === etapaId)));
      setAnexos(etapaData?.anexos || []);
    } catch (err: any) {
      notify.error(err.message || "Erro ao carregar etapa");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [etapaId, convenioId]);

  const handleEncaminharGoverno = async () => {
    setSaving(true);
    try {
      await api.encaminharGoverno(etapaId);
      notify.success("Etapa encaminhada ao governo!");
      setShowEncaminharModal(false);
      load();
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleConcluirEtapa = async () => {
    setSaving(true);
    try {
      await api.concluirEtapa(etapaId);
      notify.success("Etapa concluída!");
      setShowConcluirModal(false);
      load();
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-4xl">
        <Skeleton variant="text" className="h-6 w-64" />
        <Skeleton variant="card" className="h-48" />
        <Skeleton variant="card" className="h-32" />
      </div>
    );
  }

  if (!etapa || !convenio) {
    return <EmptyState icon="alert-triangle" title="Etapa não encontrada" description="A etapa solicitada não foi localizada." />;
  }

  const diasGoverno = etapa.prazo_governo ? daysUntil(etapa.prazo_governo) : null;
  const isGoverno = etapa.natureza === "GOVERNO";
  const canEncaminhar = isAssessor && isGoverno && etapa.status === "PENDENTE";
  const canConcluir = isAssessor && etapa.status !== "CONCLUIDA" && etapa.status !== "BLOQUEADA";

  return (
    <div className="space-y-6 max-w-4xl">
      <Breadcrumbs
        items={[
          { label: "Convênios", href: "/convenios" },
          { label: convenio.titulo, href: `/convenios/${convenioId}` },
          { label: "Etapas" },
          { label: etapa.nome },
        ]}
      />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-h1 text-text-title">{etapa.nome}</h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge label={NATUREZA_ETAPA_LABELS[etapa.natureza] || etapa.natureza} color={isGoverno ? "bg-[#B54708]/10 text-[#B54708]" : "bg-[#1D4ED8]/10 text-[#1D4ED8]"} />
            <StatusPill status={etapa.status} />
          </div>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {etapa.prazo_governo && (
          <Card padding="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="w-4 h-4 text-text-subtle" />
              <p className="text-body-sm text-text-subtle">Prazo do Governo</p>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-h2 text-text-title">{formatDate(etapa.prazo_governo)}</p>
              {diasGoverno !== null && (
                <span className={`text-meta font-medium px-2 py-0.5 rounded ${prazoBgColor(diasGoverno)}`}>
                  {diasGoverno < 0 ? "Vencido" : diasGoverno === 0 ? "Vence hoje" : `${diasGoverno} dia(s)`}
                </span>
              )}
            </div>
          </Card>
        )}
        <Card padding="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-text-subtle" />
            <p className="text-body-sm text-text-subtle">Data Início</p>
          </div>
          <p className="text-h2 text-text-title">{formatDate(etapa.data_inicio)}</p>
        </Card>
        <Card padding="p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-text-subtle" />
            <p className="text-body-sm text-text-subtle">Data Conclusão</p>
          </div>
          <p className="text-h2 text-text-title">{formatDate(etapa.data_conclusao)}</p>
        </Card>
      </div>

      {/* Resposta do Governo */}
      {isGoverno && (
        <Card padding="p-6">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="w-5 h-5 text-[#B54708]" />
            <h2 className="font-semibold text-text-title">Resposta do Governo</h2>
          </div>
          {etapa.resposta_governo ? (
            <div className="bg-[#B54708]/5 border border-[#B54708]/20 rounded-card p-4">
              <p className="text-body-sm text-text-body whitespace-pre-wrap">{etapa.resposta_governo}</p>
            </div>
          ) : (
            <p className="text-body-sm text-text-subtle">Nenhuma resposta registrada</p>
          )}
        </Card>
      )}

      {/* Tarefas */}
      <Card padding="p-6">
        <h2 className="font-semibold text-text-title mb-4">Tarefas desta etapa</h2>
        {tarefas.length === 0 ? (
          <p className="text-body-sm text-text-subtle py-4">Nenhuma tarefa vinculada a esta etapa</p>
        ) : (
          <div className="space-y-2">
            {tarefas.map((t) => (
              <Link
                key={t.id}
                href={`/tarefas/${t.id}`}
                className="flex items-center justify-between p-4 rounded-card border border-surface-border hover:bg-surface-bg transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-body-sm font-medium text-text-title truncate">{t.titulo}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-meta px-1.5 py-0.5 rounded ${PRIORITY_COLORS[t.prioridade] || ""}`}>
                      {PRIORITY_LABELS[t.prioridade] || t.prioridade}
                    </span>
                    <span className="text-meta text-text-subtle flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDate(t.prazo)}
                    </span>
                    {t.atrasada && (
                      <span className="text-meta text-[#B42318] flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Atrasada
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <StatusPill status={t.status} className="shrink-0" />
                  <ChevronRight className="w-4 h-4 text-text-subtle shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* Anexos */}
      <Card padding="p-6">
        <h2 className="font-semibold text-text-title mb-4">Anexos</h2>
        {anexos.length === 0 ? (
          <p className="text-body-sm text-text-subtle">Nenhum anexo vinculado</p>
        ) : (
          <div className="space-y-2">
            {anexos.map((a) => (
              <div key={a.id} className="flex items-center justify-between p-3 rounded-btn border border-surface-border">
                <div className="flex items-center gap-3">
                  <Paperclip className="w-4 h-4 text-text-subtle" />
                  <div>
                    <p className="text-body-sm text-text-title">{a.nome_arquivo}</p>
                    <p className="text-meta text-text-subtle">
                      v{a.versao} — {formatFileSize(a.tamanho_bytes)}
                      {a.enviado_por && <> — {a.enviado_por.name}</>}
                    </p>
                  </div>
                </div>
                <span className="text-meta text-text-subtle">{formatDate(a.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Ações do Assessor */}
      {isAssessor && (canEncaminhar || canConcluir) && (
        <Card padding="p-6">
          <h2 className="font-semibold text-text-title mb-4">Ações</h2>
          <div className="flex flex-wrap gap-3">
            {canEncaminhar && (
              <Button
                variant="primary"
                icon={Send}
                onClick={() => setShowEncaminharModal(true)}
              >
                Encaminhar ao Governo
              </Button>
            )}
            {isGoverno && etapa.status !== "CONCLUIDA" && (
              <Button
                variant="secondary"
                icon={ArrowRight}
                onClick={() => router.push(`/convenios/${convenioId}/etapas/${etapaId}/resposta`)}
              >
                Registrar Resposta do Governo
              </Button>
            )}
            {canConcluir && (
              <Button
                variant="primary"
                icon={CheckCircle2}
                onClick={() => setShowConcluirModal(true)}
              >
                Concluir Etapa
              </Button>
            )}
          </div>
        </Card>
      )}

      <ConfirmModal
        open={showEncaminharModal}
        onClose={() => setShowEncaminharModal(false)}
        onConfirm={handleEncaminharGoverno}
        title="Encaminhar ao Governo"
        message="Isso notificará o governo sobre esta etapa e o prazo começará a contar. Deseja continuar?"
        confirmLabel="Encaminhar"
        loading={saving}
        destructive={false}
      />

      <ConfirmModal
        open={showConcluirModal}
        onClose={() => setShowConcluirModal(false)}
        onConfirm={handleConcluirEtapa}
        title="Concluir Etapa"
        message="Tem certeza que deseja marcar esta etapa como concluída?"
        confirmLabel="Concluir"
        loading={saving}
        destructive={false}
      />
    </div>
  );
}
