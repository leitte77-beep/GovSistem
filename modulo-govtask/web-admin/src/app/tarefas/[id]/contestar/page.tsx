"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { formatDate, daysUntil, formatFileSize, prazoColor, cn } from "@/lib/utils";
import type { Tarefa, Anexo } from "@/types/govtask";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { PageHeader } from "@/components/ui/PageHeader";
import { FileUpload } from "@/components/ui/FileUpload";
import { Badge } from "@/components/ui/Badge";
import { PriorityBadge } from "@/components/ui/PriorityBadge";
import { notify } from "@/components/ui/Toast";
import {
  Clock,
  AlertTriangle,
  Send,
  ArrowLeft,
  FileText,
  Paperclip,
} from "lucide-react";
import Link from "next/link";

export default function ContestarTarefaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tarefa, setTarefa] = useState<Tarefa | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [novoPrazo, setNovoPrazo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const t = await api.getTarefa(id) as unknown as Tarefa;
        if (!cancelled) {
          setTarefa(t);
          if (t.prazo) {
            const d = new Date(t.prazo);
            const nextDay = new Date(d);
            nextDay.setDate(nextDay.getDate() + 7);
            setNovoPrazo(nextDay.toISOString().slice(0, 10));
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Erro ao carregar tarefa");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  const handleFileSelect = async (file: File): Promise<void> => {
    setUploadedFiles((prev) => [...prev, file]);
  };

  const handleRemoveFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!tarefa || !motivo.trim() || !novoPrazo) return;
    setSubmitting(true);
    try {
      const novoSolicitado = new Date(novoPrazo + "T23:59:59").toISOString();

      await api.criarContestacao(id, {
        motivo: motivo.trim(),
        novo_prazo_solicitado: novoSolicitado,
      });

      for (const file of uploadedFiles) {
        await api.uploadAnexo(tarefa.convenio_id, file, "OUTRO", undefined, tarefa.id);
      }

      notify.success("Contestação enviada com sucesso!");
      router.push(`/tarefas/${id}`);
    } catch (e: any) {
      notify.error(e.message || "Erro ao enviar contestação");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-2xl">
        <Skeleton variant="text" className="h-6 w-64" />
        <Skeleton variant="card" className="h-12" />
        <Skeleton variant="card" className="h-52" />
        <Skeleton variant="card" className="h-32" />
      </div>
    );
  }

  if (error || !tarefa) {
    return (
      <div className="text-center py-16">
        <AlertTriangle className="w-12 h-12 text-[#B42318] mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Erro</h2>
        <p className="text-sm text-gray-500 mb-4">{error || "Tarefa não encontrada"}</p>
        <Button variant="secondary" onClick={() => router.push("/tarefas")}>
          Voltar
        </Button>
      </div>
    );
  }

  const dias = tarefa.prazo ? daysUntil(tarefa.prazo) : 0;

  const breadcrumbs = [
    { label: "Tarefas", href: "/tarefas" },
    { label: tarefa.titulo, href: `/tarefas/${id}` },
    { label: "Contestar" },
  ];

  const isValid = motivo.trim().length > 0 && novoPrazo.length > 0;

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="Contestar Tarefa"
        description="Solicite alteração do prazo e justifique o motivo."
        breadcrumbs={breadcrumbs}
      />

      <Card>
        <div className="flex items-start gap-3 mb-6 p-4 bg-gray-50 rounded-lg">
          <FileText className="w-5 h-5 text-[#1D4ED8] mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">{tarefa.titulo}</p>
            {tarefa.convenio && (
              <Link
                href={`/convenios/${tarefa.convenio.id}`}
                className="text-xs text-[#1D4ED8] hover:underline"
              >
                {tarefa.convenio.titulo}
              </Link>
            )}
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <PriorityBadge priority={tarefa.prioridade} />
              <span className={cn("text-sm font-medium flex items-center gap-1", prazoColor(dias))}>
                <Clock size={14} />
                Prazo atual: {tarefa.prazo ? formatDate(tarefa.prazo) : "—"}
                {dias < 0
                  ? ` (atrasada há ${Math.abs(dias)}d)`
                  : dias <= 3
                    ? ` (${dias}d restantes)`
                    : ""}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Motivo da contestação <span className="text-[#B42318]">*</span>
            </label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Explique por que o prazo precisa ser alterado..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              rows={5}
            />
            {motivo.trim().length === 0 && (
              <p className="text-xs text-gray-400 mt-1">Campo obrigatório</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Novo prazo solicitado <span className="text-[#B42318]">*</span>
            </label>
            <input
              type="date"
              value={novoPrazo}
              onChange={(e) => setNovoPrazo(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            {novoPrazo && (
              <p className="text-xs text-gray-400 mt-1">
                Data selecionada: {formatDate(novoPrazo)}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Anexos de suporte (opcional)
            </label>
            <FileUpload onUpload={handleFileSelect} className="mb-3" />

            {uploadedFiles.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 font-medium">Arquivos para envio:</p>
                {uploadedFiles.map((file, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Paperclip className="w-4 h-4 text-gray-400 shrink-0" />
                      <span className="text-sm text-gray-600 truncate">{file.name}</span>
                      <span className="text-xs text-gray-400">{formatFileSize(file.size)}</span>
                    </div>
                    <button
                      onClick={() => handleRemoveFile(i)}
                      className="text-xs text-[#B42318] hover:text-[#B42318]/80 ml-2 shrink-0"
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="secondary" onClick={() => router.push(`/tarefas/${id}`)}>
          Cancelar
        </Button>
        <Button
          icon={Send}
          onClick={handleSubmit}
          loading={submitting}
          disabled={submitting || !isValid}
        >
          Enviar Contestação
        </Button>
      </div>
    </div>
  );
}
