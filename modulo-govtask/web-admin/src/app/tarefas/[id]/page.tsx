"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  formatDate,
  formatDateTime,
  formatFileSize,
  daysUntil,
  relativeTime,
  prazoColor,
  prazoBgColor,
  STATUS_COLORS,
  STATUS_LABELS,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  cn,
} from "@/lib/utils";
import type { Tarefa, Comentario, Anexo, TimelineEvent } from "@/types/govtask";
import { StatusPill } from "@/components/ui/StatusPill";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { FileUpload } from "@/components/ui/FileUpload";
import { notify } from "@/components/ui/Toast";
import {
  Clock,
  AlertTriangle,
  Send,
  Paperclip,
  Download,
  User,
  Building2,
  Calendar,
  CheckCircle,
  XCircle,
  RotateCcw,
  ArrowLeft,
} from "lucide-react";

export default function TarefaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, hasRole } = useAuth();
  const [tarefa, setTarefa] = useState<Tarefa | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comentarioTexto, setComentarioTexto] = useState("");
  const [enviandoComentario, setEnviandoComentario] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const t = await api.getTarefa(id) as unknown as Tarefa;
      setTarefa(t);
    } catch (e: any) {
      setError(e.message || "Erro ao carregar tarefa");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAceitar = async () => {
    try {
      await api.aceitarTarefa(id);
      notify.success("Tarefa aceita com sucesso!");
      load();
    } catch (e: any) {
      notify.error(e.message || "Erro ao aceitar tarefa");
    }
  };

  const handleDevolver = async () => {
    try {
      await api.devolverTarefa(id, "Tarefa devolvida para ajustes.");
      notify.success("Tarefa devolvida!");
      load();
    } catch (e: any) {
      notify.error(e.message || "Erro ao devolver tarefa");
    }
  };

  const handleConcluir = async () => {
    try {
      await api.concluirTarefa(id);
      notify.success("Tarefa concluída com sucesso!");
      load();
    } catch (e: any) {
      notify.error(e.message || "Erro ao concluir tarefa");
    }
  };

  const handleCancelar = async () => {
    setCanceling(true);
    try {
      await api.cancelarTarefa(id);
      notify.success("Tarefa cancelada.");
      setShowCancelConfirm(false);
      load();
    } catch (e: any) {
      notify.error(e.message || "Erro ao cancelar tarefa");
    } finally {
      setCanceling(false);
    }
  };

  const handleComentar = async () => {
    if (!comentarioTexto.trim()) return;
    setEnviandoComentario(true);
    try {
      await api.addComentario(id, comentarioTexto.trim());
      notify.success("Comentário adicionado!");
      setComentarioTexto("");
      load();
    } catch (e: any) {
      notify.error(e.message || "Erro ao adicionar comentário");
    } finally {
      setEnviandoComentario(false);
    }
  };

  const handleUpload = async (file: File): Promise<void> => {
    if (!tarefa) return;
    setUploading(true);
    try {
      await api.uploadAnexo(tarefa.convenio_id, file, "OUTRO", undefined, tarefa.id);
      notify.success("Anexo enviado!");
      load();
    } catch (e: any) {
      notify.error(e.message || "Erro ao enviar anexo");
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton variant="text" className="h-8 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton variant="card" className="h-48" />
            <Skeleton variant="card" className="h-32" />
            <Skeleton variant="card" className="h-40" />
          </div>
          <div className="space-y-4">
            <Skeleton variant="card" className="h-64" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !tarefa) {
    return (
      <div className="text-center py-16">
        <AlertTriangle className="w-12 h-12 text-[#B42318] mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Tarefa não encontrada</h2>
        <p className="text-sm text-gray-500 mb-4">{error || "A tarefa solicitada não existe ou foi removida."}</p>
        <Button variant="secondary" onClick={() => router.push("/tarefas")}>
          Voltar para Tarefas
        </Button>
      </div>
    );
  }

  const dias = tarefa.prazo ? daysUntil(tarefa.prazo) : 0;
  const isAssessor = hasRole("ASSESSOR", "ADMIN");
  const isResponsavel = tarefa.atribuida_a?.id === user?.id;
  const comentarios = tarefa.comentarios || [];
  const anexos = tarefa.anexos || [];
  const eventos = tarefa.eventos || [];

  return (
    <div className="space-y-6 pb-24">
      <button
        onClick={() => router.push("/tarefas")}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        <ArrowLeft size={16} />
        Voltar para Tarefas
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Descrição */}
          <Card>
            <h1 className="text-xl font-bold text-gray-900 mb-2">{tarefa.titulo}</h1>
            {tarefa.convenio && (
              <Link
                href={`/convenios/${tarefa.convenio.id}`}
                className="text-sm text-[#1D4ED8] hover:underline"
              >
                {tarefa.convenio.titulo}
              </Link>
            )}
            <div className="mt-4 text-sm text-gray-600 leading-relaxed">
              {tarefa.descricao ? (
                <div dangerouslySetInnerHTML={{ __html: tarefa.descricao }} />
              ) : (
                <p className="text-gray-400 italic">Nenhuma descrição fornecida.</p>
              )}
            </div>
          </Card>

          {/* Anexos */}
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">Anexos</h3>
            <FileUpload onUpload={handleUpload} className="mb-4" />

            {anexos.length > 0 ? (
              <div className="space-y-2">
                {anexos.map((a: Anexo) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Paperclip className="w-4 h-4 text-gray-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-700 truncate">{a.nome_arquivo}</p>
                        <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                          <Badge label={a.tipo_documento} color="bg-[#F6F7F9] text-[#667085]" />
                          <span>v{a.versao}</span>
                          <span>{formatFileSize(a.tamanho_bytes)}</span>
                        </div>
                      </div>
                    </div>
                    <a
                      href={`/api/govtask/anexos/${a.id}/download`}
                      className="text-[#1D4ED8] hover:text-[#1D4ED8]/80 shrink-0 ml-3"
                      title="Download"
                    >
                      <Download size={16} />
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Nenhum anexo nesta tarefa.</p>
            )}
          </Card>

          {/* Comentários */}
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4">
              Comentários ({comentarios.length})
            </h3>

            {comentarios.length > 0 ? (
              <div className="space-y-4 mb-6">
                {comentarios.map((c: Comentario) => (
                  <div key={c.id} className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#1D4ED8]/10 text-[#1D4ED8] flex items-center justify-center text-sm font-medium shrink-0">
                      {c.autor?.name?.charAt(0)?.toUpperCase() || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-900">
                          {c.autor?.name || "Usuário desconhecido"}
                        </span>
                        <span className="text-xs text-gray-400">
                          {relativeTime(c.created_at)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 whitespace-pre-wrap">{c.texto}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 mb-6">Nenhum comentário ainda.</p>
            )}

            <div className="flex gap-2">
              <textarea
                value={comentarioTexto}
                onChange={(e) => setComentarioTexto(e.target.value)}
                placeholder="Adicionar comentário..."
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleComentar();
                  }
                }}
              />
              <Button
                icon={Send}
                onClick={handleComentar}
                disabled={!comentarioTexto.trim() || enviandoComentario}
                loading={enviandoComentario}
                size="md"
                className="shrink-0 self-end"
              >
                Enviar
              </Button>
            </div>
          </Card>

          {/* Timeline */}
          {eventos.length > 0 && (
            <Card>
              <h3 className="font-semibold text-gray-900 mb-4">Histórico</h3>
              <div className="space-y-0 pl-6 relative">
                {eventos.map((event: TimelineEvent, i: number) => {
                  const isLast = i === eventos.length - 1;
                  return (
                    <div key={event.id} className="relative pb-4">
                      {!isLast && (
                        <div className="absolute left-[-1.15rem] top-3 bottom-0 w-0.5 bg-[#E4E7EC]" />
                      )}
                      <div className="absolute left-[-1.5rem] w-2.5 h-2.5 rounded-full bg-[#1D4ED8] mt-1" />
                      <div>
                        <p className="text-sm text-gray-700">{event.descricao}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {event.ator?.name && (
                            <span className="font-medium text-gray-500 mr-1">{event.ator.name} —</span>
                          )}
                          {relativeTime(event.ocorrido_em)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <StatusPill status={tarefa.status} className="text-sm" />
              <PriorityBadge priority={tarefa.prioridade} />
            </div>

            {/* Prazo */}
            <div className={cn("p-4 rounded-lg mb-4", prazoBgColor(dias))}>
              <div className="flex items-center gap-2">
                {tarefa.atrasada || dias < 0 ? (
                  <AlertTriangle className="w-5 h-5 text-[#B42318]" />
                ) : (
                  <Clock className="w-5 h-5" />
                )}
                <div>
                  <p className={cn("text-sm font-medium", prazoColor(dias))}>
                    {tarefa.atrasada || dias < 0
                      ? `Atrasada há ${Math.abs(dias)} dia${Math.abs(dias) !== 1 ? "s" : ""}`
                      : dias === 0
                        ? "Vence hoje"
                        : `${dias} dia${dias !== 1 ? "s" : ""} restante${dias !== 1 ? "s" : ""}`}
                  </p>
                  <p className="text-xs text-gray-500">
                    Prazo: {tarefa.prazo ? formatDate(tarefa.prazo) : "—"}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <User className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-400">Responsável</p>
                  <p className="text-sm font-medium text-gray-900">
                    {tarefa.atribuida_a?.name || "Não atribuída"}
                  </p>
                </div>
              </div>

              {tarefa.setor_destino && (
                <div className="flex items-center gap-3">
                  <Building2 className="w-4 h-4 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-400">Setor</p>
                    <p className="text-sm font-medium text-gray-900">{tarefa.setor_destino.nome}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <User className="w-4 h-4 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-400">Criada por</p>
                  <p className="text-sm text-gray-900">
                    {tarefa.criada_por?.name || "—"}
                  </p>
                  <p className="text-xs text-gray-400">{relativeTime(tarefa.created_at)}</p>
                </div>
              </div>
            </div>

            <hr className="my-4 border-gray-100" />

            <div className="space-y-2">
              {tarefa.data_aceite && (
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-4 h-4 text-[#067647]" />
                  <div>
                    <p className="text-xs text-gray-400">Aceite</p>
                    <p className="text-sm text-gray-900">{formatDateTime(tarefa.data_aceite)}</p>
                  </div>
                </div>
              )}
              {tarefa.data_entrega && (
                <div className="flex items-center gap-3">
                  <Send className="w-4 h-4 text-[#1D4ED8]" />
                  <div>
                    <p className="text-xs text-gray-400">Entrega</p>
                    <p className="text-sm text-gray-900">{formatDateTime(tarefa.data_entrega)}</p>
                  </div>
                </div>
              )}
              {tarefa.data_conclusao && (
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-4 h-4 text-[#067647]" />
                  <div>
                    <p className="text-xs text-gray-400">Conclusão</p>
                    <p className="text-sm text-gray-900">{formatDateTime(tarefa.data_conclusao)}</p>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-40 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Ações:</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {tarefa.status === "AGUARDANDO_ACEITE" && isResponsavel && (
              <Button icon={CheckCircle} onClick={handleAceitar}>
                Aceitar Tarefa
              </Button>
            )}

            {tarefa.status === "EM_ANDAMENTO" && isResponsavel && (
              <>
                <Button onClick={() => router.push(`/tarefas/${id}/entregar`)}>
                  Entregar
                </Button>
                <Button
                  variant="secondary"
                  icon={AlertTriangle}
                  onClick={() => router.push(`/tarefas/${id}/contestar`)}
                >
                  Contestar
                </Button>
              </>
            )}

            {tarefa.status === "ENTREGUE" && isAssessor && (
              <>
                <Button icon={CheckCircle} onClick={handleConcluir}>
                  Concluir
                </Button>
                <Button variant="secondary" icon={RotateCcw} onClick={handleDevolver}>
                  Devolver
                </Button>
              </>
            )}

            {tarefa.status === "DEVOLVIDA" && isResponsavel && (
              <Button icon={RotateCcw} onClick={handleAceitar}>
                Retomar Tarefa
              </Button>
            )}

            {isAssessor && !["CONCLUIDA", "CANCELADA"].includes(tarefa.status) && (
              <Button
                variant="danger"
                icon={XCircle}
                onClick={() => setShowCancelConfirm(true)}
              >
                Cancelar
              </Button>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        open={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        onConfirm={handleCancelar}
        title="Cancelar Tarefa"
        message="Tem certeza que deseja cancelar esta tarefa? Esta ação não pode ser desfeita."
        confirmLabel="Sim, cancelar"
        loading={canceling}
        destructive
      />
    </div>
  );
}
