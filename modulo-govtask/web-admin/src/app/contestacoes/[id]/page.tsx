"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, formatDateTime, STATUS_COLORS, STATUS_LABELS } from "@/lib/utils";
import type { Contestacao } from "@/types/govtask";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { StatusPill } from "@/components/ui/StatusPill";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { notify } from "@/components/ui/Toast";
import {
  Clock,
  Calendar,
  User,
  FileText,
  ThumbsUp,
  ThumbsDown,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";

export default function ContestacaoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { hasRole } = useAuth();
  const isAssessor = hasRole("ASSESSOR", "ADMIN");

  const [contestacao, setContestacao] = useState<Contestacao | null>(null);
  const [tarefa, setTarefa] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAprovarModal, setShowAprovarModal] = useState(false);
  const [showRecusar, setShowRecusar] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const c = await api.getContestacao(id);
        setContestacao(c);

        const tarefaId = (c as any).tarefa_id;
        if (tarefaId) {
          const t = await api.getTarefa(tarefaId);
          setTarefa(t);
        }
      } catch (err: any) {
        notify.error(err.message || "Erro ao carregar contestação");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const handleAprovar = async () => {
    setSaving(true);
    try {
      await api.decidirContestacao(id, { aprovada: true });
      notify.success("Contestação aprovada! Prazo ajustado.");
      if (tarefa) {
        router.push(`/tarefas/${tarefa.id}`);
      } else {
        router.push("/tarefas");
      }
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setSaving(false);
      setShowAprovarModal(false);
    }
  };

  const handleRecusar = async () => {
    if (!justificativa.trim()) {
      notify.error("Informe a justificativa da recusa");
      return;
    }
    setSaving(true);
    try {
      await api.decidirContestacao(id, { aprovada: false, justificativa });
      notify.success("Contestação recusada!");
      if (tarefa) {
        router.push(`/tarefas/${tarefa.id}`);
      } else {
        router.push("/tarefas");
      }
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-3xl">
        <Skeleton variant="text" className="h-6 w-48" />
        <Skeleton variant="card" className="h-64" />
      </div>
    );
  }

  if (!contestacao) {
    return (
      <EmptyState
        icon="alert-triangle"
        title="Contestação não encontrada"
        description="A contestação solicitada não foi localizada."
      />
    );
  }

  const isPendente = contestacao.status === "PENDENTE";
  const currentPrazo = tarefa?.prazo ? new Date(tarefa.prazo) : null;
  const requestedPrazo = contestacao.novo_prazo_solicitado
    ? new Date(contestacao.novo_prazo_solicitado)
    : null;
  const diffDays =
    currentPrazo && requestedPrazo
      ? Math.ceil((requestedPrazo.getTime() - currentPrazo.getTime()) / (1000 * 60 * 60 * 24))
      : null;

  return (
    <div className="space-y-6 max-w-3xl">
      <Breadcrumbs
        items={[
          { label: "Tarefas", href: "/tarefas" },
          ...(tarefa ? [{ label: tarefa.titulo, href: `/tarefas/${tarefa.id}` }] : []),
          { label: "Contestação" },
        ]}
      />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-h1 text-text-title">Decidir Contestação</h1>
          <p className="text-body-sm text-text-body mt-1">
            Análise da solicitação de alteração de prazo
          </p>
        </div>
        <StatusPill
          status={
            contestacao.status === "PENDENTE"
              ? "PENDENTE"
              : contestacao.status === "APROVADA"
              ? "APROVADA"
              : "REJEITADA"
          }
        />
      </div>

      {tarefa && (
        <Card padding="p-6">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-5 h-5 text-text-subtle" />
            <h2 className="font-semibold text-text-title">Tarefa relacionada</h2>
          </div>
          <Link
            href={`/tarefas/${tarefa.id}`}
            className="text-body-sm text-[#1D4ED8] hover:underline font-medium"
          >
            {tarefa.titulo}
          </Link>
          <div className="flex items-center gap-3 mt-2">
            <StatusPill status={tarefa.status} className="text-meta" />
            {tarefa.prazo && (
              <span className="text-meta text-text-subtle flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Prazo: {formatDate(tarefa.prazo)}
              </span>
            )}
          </div>
        </Card>
      )}

      <Card padding="p-6" className="space-y-6">
        {/* Contestação info */}
        <div>
          <h2 className="font-semibold text-text-title mb-4">Detalhes da Contestação</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <p className="text-meta text-text-subtle mb-1">Solicitado por</p>
              <p className="text-body-sm text-text-title flex items-center gap-2">
                <User className="w-4 h-4 text-text-subtle" />
                {contestacao.solicitado_por?.name || "—"}
              </p>
            </div>
            <div>
              <p className="text-meta text-text-subtle mb-1">Data da solicitação</p>
              <p className="text-body-sm text-text-title flex items-center gap-2">
                <Calendar className="w-4 h-4 text-text-subtle" />
                {formatDateTime(contestacao.created_at)}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-meta text-text-subtle mb-1">Motivo</p>
            <div className="bg-surface-bg rounded-card p-4 border border-surface-border">
              <p className="text-body-sm text-text-body whitespace-pre-wrap">{contestacao.motivo || "—"}</p>
            </div>
          </div>
        </div>

        {/* Prazo comparison */}
        <div className="border-t border-surface-border pt-6">
          <h3 className="font-semibold text-text-title mb-4">Comparação de Prazos</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-[#F6F7F9] rounded-card p-4">
              <p className="text-meta text-text-subtle">Prazo Atual</p>
              <p className="text-h2 text-text-title mt-1">
                {contestacao.novo_prazo_solicitado ? (
                  <>
                    {formatDate(tarefa?.prazo || "")}
                    {currentPrazo && currentPrazo < new Date() && (
                      <span className="text-meta text-[#B42318] flex items-center gap-1 mt-1">
                        <AlertTriangle className="w-3 h-3" />
                        Vencido
                      </span>
                    )}
                  </>
                ) : (
                  formatDate(tarefa?.prazo || "")
                )}
              </p>
            </div>
            <div className="bg-[#1D4ED8]/5 rounded-card p-4 border border-[#1D4ED8]/20">
              <p className="text-meta text-[#1D4ED8]">Novo Prazo Solicitado</p>
              <p className="text-h2 text-[#1D4ED8] mt-1">
                {formatDate(contestacao.novo_prazo_solicitado)}
              </p>
              {diffDays !== null && (
                <p className={`text-meta mt-1 ${diffDays > 0 ? "text-[#B54708]" : "text-text-subtle"}`}>
                  {diffDays > 0 ? `+${diffDays} dia(s) de extensão` : "Mesma data"}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Decisão anterior */}
        {contestacao.status !== "PENDENTE" && contestacao.decidido_por && (
          <div className="border-t border-surface-border pt-6">
            <h3 className="font-semibold text-text-title mb-3">
              Decisão:{" "}
              <StatusPill status={contestacao.status} />
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-meta text-text-subtle">Decidido por</p>
                <p className="text-body-sm text-text-title">{contestacao.decidido_por.name || "—"}</p>
              </div>
              <div>
                <p className="text-meta text-text-subtle">Data da decisão</p>
                <p className="text-body-sm text-text-title">{formatDateTime(contestacao.data_decisao)}</p>
              </div>
            </div>
            {contestacao.justificativa_decisao && (
              <div className="mt-3">
                <p className="text-meta text-text-subtle mb-1">Justificativa</p>
                <div className="bg-surface-bg rounded-card p-3 border border-surface-border">
                  <p className="text-body-sm text-text-body">{contestacao.justificativa_decisao}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Actions for assessor */}
      {isAssessor && isPendente && (
        <Card padding="p-6">
          <h2 className="font-semibold text-text-title mb-4">Decisão</h2>

          {!showRecusar ? (
            <div className="flex flex-wrap gap-3">
              <Button
                variant="primary"
                icon={ThumbsUp}
                onClick={() => setShowAprovarModal(true)}
              >
                Aprovar
              </Button>
              <Button
                variant="danger"
                icon={ThumbsDown}
                onClick={() => setShowRecusar(true)}
              >
                Recusar
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-body-sm font-medium text-text-title mb-2">
                  Justificativa da Recusa *
                </label>
                <textarea
                  value={justificativa}
                  onChange={(e) => setJustificativa(e.target.value)}
                  placeholder="Explique o motivo da recusa..."
                  className="w-full border border-surface-border rounded-card px-4 py-3 text-body-sm focus:outline-none focus:ring-2 focus:ring-[#B42318] min-h-[120px] resize-y"
                  required
                />
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowRecusar(false);
                    setJustificativa("");
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  variant="danger"
                  onClick={handleRecusar}
                  loading={saving}
                >
                  Confirmar Recusa
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <ConfirmModal
        open={showAprovarModal}
        onClose={() => setShowAprovarModal(false)}
        onConfirm={handleAprovar}
        title="Aprovar Contestação"
        message={
          diffDays !== null && diffDays > 0
            ? `Aprovar contestação e ajustar prazo em +${diffDays} dia(s)? O novo prazo será ${formatDate(contestacao.novo_prazo_solicitado)}.`
            : "Aprovar contestação e ajustar prazo? Esta ação não pode ser desfeita."
        }
        confirmLabel="Aprovar e Ajustar Prazo"
        loading={saving}
        destructive={false}
      />
    </div>
  );
}
