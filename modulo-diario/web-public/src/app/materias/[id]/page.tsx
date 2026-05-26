"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, FileText, Loader2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatBrasiliaDateTime } from "@/lib/dates";

export default function MatterDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getMatter(id).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div>;
  if (error) return <div className="max-w-4xl mx-auto px-4 py-12 text-center text-red-600">{error}</div>;
  if (!data) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex items-center gap-2 mb-6 text-sm font-medium text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft size={16} />
        Voltar
      </button>

      <div className="mb-6">
        <p className="text-xs text-gray-500 mb-1">{data.act_type}{data.org_unit ? ` • ${data.org_unit}` : ""}</p>
        <h1 className="text-2xl font-bold text-gray-800">{data.title}</h1>
        {data.author && <p className="text-sm text-gray-500 mt-1">{data.author}</p>}
        {data.published_at && <p className="text-xs text-gray-400 mt-1">Publicado em {new Date(data.published_at).toLocaleDateString("pt-BR")}</p>}
      </div>

      {data.signature && (
        <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <div className="flex items-start gap-3">
            <ShieldCheck size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Documento assinado digitalmente</p>
              <p className="mt-1">
                Certificado: {data.signature.certificate_label || data.signature.certificate_subject || "-"}
              </p>
              {data.signature.signed_at && (
                <p className="text-xs text-green-700">
                  Assinado em {formatBrasiliaDateTime(data.signature.signed_at)}
                </p>
              )}
              {data.edition?.verification_code && (
                <Link href={`/verificar/${data.edition.verification_code}`} className="mt-2 inline-block text-xs font-medium text-green-900 underline">
                  Verificar autenticidade
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {data.summary && (
        <div className="p-4 bg-gray-50 border rounded-lg mb-6 text-sm text-gray-700 italic">
          {data.summary}
        </div>
      )}

      <div className="prose max-w-none text-gray-800" dangerouslySetInnerHTML={{ __html: data.content_html }} />

      {data.attachments?.length > 0 && (
        <div className="mt-8">
          <h2 className="font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
            <FileText size={16} /> Anexos
          </h2>
          <ul className="space-y-1">
            {data.attachments.map((att: any) => (
              <li key={att.id} className="text-sm text-blue-700 hover:underline">
                <a href={att.file?.filename ? `/api/download/${att.file.filename}` : "#"} target="_blank">
                  {att.title || att.file?.filename || "Anexo"}
                </a>
                {att.file?.size_bytes && <span className="text-gray-400 ml-2">({(att.file.size_bytes / 1024).toFixed(1)} KB)</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
