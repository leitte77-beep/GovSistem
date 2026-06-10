"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FileUpload } from "@/components/ui/FileUpload";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Skeleton } from "@/components/ui/Skeleton";
import { notify } from "@/components/ui/Toast";
import { Save, ArrowLeft } from "lucide-react";

export default function RespostaGovernoPage() {
  const { id: convenioId, etapaId } = useParams<{ id: string; etapaId: string }>();
  const router = useRouter();

  const [convenio, setConvenio] = useState<{ id: string; titulo: string } | null>(null);
  const [etapa, setEtapa] = useState<{ id: string; nome: string; natureza: string } | null>(null);
  const [resposta, setResposta] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [c, e] = await Promise.all([
          api.getConvenio(convenioId),
          api.getEtapa(etapaId),
        ]);
        setConvenio({ id: c.id, titulo: c.titulo });

        const etapaData = "etapas" in c
          ? (c as any).etapas?.find((ep: any) => ep.id === etapaId)
          : e;

        setEtapa(etapaData);
        if (etapaData?.resposta_governo) {
          setResposta(etapaData.resposta_governo);
        }
      } catch (err: any) {
        notify.error(err.message || "Erro ao carregar etapa");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [convenioId, etapaId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resposta.trim()) {
      notify.error("Informe a resposta do governo");
      return;
    }
    setSaving(true);
    try {
      await api.registrarRespostaGoverno(etapaId, resposta);
      notify.success("Resposta registrada com sucesso!");
      router.push(`/convenios/${convenioId}/etapas/${etapaId}`);
    } catch (err: any) {
      notify.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (file: File): Promise<void> => {
    api.uploadAnexo(convenioId, file, "OUTRO", etapaId).catch((e: any) => notify.error(e.message));
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-2xl">
        <Skeleton variant="text" className="h-6 w-64" />
        <Skeleton variant="card" className="h-96" />
      </div>
    );
  }

  if (!convenio || !etapa) {
    return (
      <div className="text-center py-12">
        <p className="text-text-subtle">Etapa não encontrada</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Breadcrumbs
        items={[
          { label: "Convênios", href: "/convenios" },
          { label: convenio.titulo, href: `/convenios/${convenioId}` },
          { label: etapa.nome, href: `/convenios/${convenioId}/etapas/${etapaId}` },
          { label: "Resposta do Governo" },
        ]}
      />

      <h1 className="text-h1 text-text-title">Registrar Resposta do Governo</h1>
      <p className="text-body-sm text-text-body">
        Etapa: <span className="font-medium">{etapa.nome}</span>
      </p>

      <form onSubmit={handleSubmit}>
        <Card padding="p-6" className="space-y-6">
          <div>
            <label className="block text-body-sm font-medium text-text-title mb-2">
              Resposta do Governo *
            </label>
            <textarea
              value={resposta}
              onChange={(e) => setResposta(e.target.value)}
              placeholder="Descreva a resposta, decisão ou comunicado recebido do órgão governamental..."
              className="w-full border border-surface-border rounded-card px-4 py-3 text-body-sm focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] min-h-[200px] resize-y"
              required
            />
          </div>

          <div>
            <label className="block text-body-sm font-medium text-text-title mb-2">
              Anexos
            </label>
            <FileUpload onUpload={handleUpload} />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-surface-border">
            <Button
              type="button"
              variant="secondary"
              icon={ArrowLeft}
              onClick={() => router.back()}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              icon={Save}
              loading={saving}
            >
              Registrar Resposta
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
