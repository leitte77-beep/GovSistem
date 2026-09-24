"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import EditionForm from "@/components/Edition/EditionForm";
import { api } from "@/lib/api";
import type { Edition } from "@/types/edition";

export default function EditEditionPage() {
  const params = useParams();
  const id = params.id as string;
  const [edition, setEdition] = useState<Edition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getEdition(id).then(setEdition).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20" role="status">
        <Loader2 size={24} className="animate-spin text-primary" aria-hidden="true" />
        <p className="text-body-md text-on-surface-variant">Carregando edição…</p>
      </div>
    );
  }

  if (error || !edition) {
    return (
      <div className="mx-auto w-full max-w-lg px-4 py-16">
        <div className="card p-6 text-center">
          <p className="text-headline-sm text-on-surface">
            {error ? "Não foi possível abrir a edição" : "Edição não encontrada"}
          </p>
          <p className="mt-1 text-body-md text-error">
            {error || "A edição solicitada não existe ou foi removida."}
          </p>
          <Link href="/editions" className="btn-outline btn-sm mt-5 inline-flex">
            <ArrowLeft size={16} aria-hidden="true" />
            Voltar para edições
          </Link>
        </div>
      </div>
    );
  }

  return <EditionForm edition={edition} />;
}
