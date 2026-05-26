"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import MatterForm from "@/components/Matter/MatterForm";
import { api } from "@/lib/api";
import type { Matter } from "@/types/matter";

export default function EditMatterPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const initialStep = searchParams.get("step") ? Number(searchParams.get("step")) : undefined;
  const [matter, setMatter] = useState<Matter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return <MatterForm matter={matter} initialStep={initialStep} />;
}
