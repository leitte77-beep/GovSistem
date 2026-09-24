"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import MatterForm from "@/components/Matter/MatterForm";
import WorkflowStatusPanel from "@/components/Matter/WorkflowStatusPanel";
import { api } from "@/lib/api";
import type { Matter } from "@/types/matter";

export default function EditMatterPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const initialStep = searchParams.get("step") ? Number(searchParams.get("step")) : undefined;
  const [matter, setMatter] = useState<Matter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rectifying, setRectifying] = useState(false);

  const handleRectify = async () => {
    if (!matter) return;
    setRectifying(true);
    try {
      const created = await api.rectifyMatter(matter.id);
      toast.success("Retificação criada como rascunho.");
      router.push(`/matters/${created.id}/edit`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao retificar");
    } finally {
      setRectifying(false);
    }
  };

  useEffect(() => {
    api
      .getMatter(id)
      .then(setMatter)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !matter) {
    return (
      <div className="max-w-5xl mx-auto py-12 px-4 text-center">
        <p className="text-red-600">{error || "Matéria não encontrada"}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="max-w-5xl mx-auto px-4 pt-4 flex justify-end gap-3">
        {matter.status === "published" && (
          <button
            type="button"
            onClick={handleRectify}
            disabled={rectifying}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 hover:underline disabled:opacity-50"
            title="Cria um rascunho de retificação vinculado a esta publicação"
          >
            {rectifying ? "Criando retificação…" : "Retificar publicação"}
          </button>
        )}
        <Link
          href={`/matters/${matter.id}/relacoes`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-700 hover:underline"
          title="Registrar retificação, revogação, alteração etc. entre publicações"
        >
          Relacionar publicações →
        </Link>
      </div>
      <WorkflowStatusPanel matterId={matter.id} workflowStatus={matter.workflow_status} />
      <MatterForm matter={matter} initialStep={initialStep} />
    </div>
  );
}
