"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
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

  if (loading) return <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div>;
  if (error || !edition) return <div className="max-w-5xl mx-auto py-12 px-4 text-center"><p className="text-red-600">{error || "Edição não encontrada"}</p></div>;

  return <EditionForm edition={edition} />;
}
