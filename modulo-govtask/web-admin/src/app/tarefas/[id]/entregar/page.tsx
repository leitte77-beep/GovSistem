"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { formatFileSize, formatDate } from "@/lib/utils";
import type { Tarefa, Anexo } from "@/types/govtask";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { PageHeader } from "@/components/ui/PageHeader";
import { FileUpload } from "@/components/ui/FileUpload";
import { Badge } from "@/components/ui/Badge";
import { notify } from "@/components/ui/Toast";
import {
  Paperclip,
  Download,
  Send,
  ArrowLeft,
  AlertTriangle,
  FileText,
} from "lucide-react";
import Link from "next/link";

const BASE_URL = "/api/govtask";

async function entregarTarefaComObservacoes(
  id: string,
  observacoes: string
): Promise<Tarefa> {
  const token = localStorage.getItem("govtask_access_token");
  const res = await fetch(`${BASE_URL}/tarefas/${id}/entregar`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ observacoes }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Erro ao entregar tarefa" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export default function EntregarTarefaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tarefa, setTarefa] = useState<Tarefa | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [observacoes, setObservacoes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const t = await api.getTarefa(id) as unknown as Tarefa;
        if (!cancelled) setTarefa(t);
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
    if (!tarefa) return;
    setSubmitting(true);
    try {
      await entregarTarefaComObservacoes(id, observacoes.trim());

      for (const file of uploadedFiles) {
        await api.uploadAnexo(tarefa.convenio_id, file, "OUTRO", undefined, tarefa.id);
      }

      notify.success("Tarefa entregue com sucesso!");
      router.push(`/tarefas/${id}`);
    } catch (e: any) {
      notify.error(e.message || "Erro ao entregar tarefa");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-2xl">
        <Skeleton variant="text" className="h-6 w-64" />
        <Skeleton variant="card" className="h-12" />
        <Skeleton variant="card" className="h-40" />
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

  const existingAnexos = tarefa.anexos || [];

  const breadcrumbs = [
    { label: "Tarefas", href: "/tarefas" },
    { label: tarefa.titulo, href: `/tarefas/${id}` },
    { label: "Entregar" },
  ];

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="Entregar Tarefa"
        description="Confirme a entrega e anexe os arquivos necessários."
        breadcrumbs={breadcrumbs}
      />

      <Card>
        <div className="flex items-start gap-3 mb-6">
          <FileText className="w-5 h-5 text-[#1D4ED8] mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-gray-900">{tarefa.titulo}</p>
            {tarefa.convenio && (
              <Link
                href={`/convenios/${tarefa.convenio.id}`}
                className="text-xs text-[#1D4ED8] hover:underline"
              >
                {tarefa.convenio.titulo}
              </Link>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Observações da entrega
            </label>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Descreva observações relevantes sobre a entrega..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
              rows={5}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Anexos adicionais
            </label>
            <FileUpload onUpload={handleFileSelect} className="mb-3" />

            {uploadedFiles.length > 0 && (
              <div className="space-y-2 mb-3">
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

            {existingAnexos.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 font-medium mb-2">Anexos existentes da tarefa:</p>
                <div className="space-y-1">
                  {existingAnexos.map((a: Anexo) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Paperclip className="w-3 h-3 text-gray-400 shrink-0" />
                        <span className="text-sm text-gray-600 truncate">{a.nome_arquivo}</span>
                        <Badge label={a.tipo_documento} color="bg-[#F6F7F9] text-[#667085]" />
                        <span className="text-xs text-gray-400">v{a.versao}</span>
                      </div>
                      <span className="text-xs text-gray-400">{formatFileSize(a.tamanho_bytes)}</span>
                    </div>
                  ))}
                </div>
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
          disabled={submitting}
        >
          Confirmar Entrega
        </Button>
      </div>
    </div>
  );
}
