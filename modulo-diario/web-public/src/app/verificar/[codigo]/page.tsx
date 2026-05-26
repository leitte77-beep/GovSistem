"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { formatBrasiliaDateTime } from "@/lib/dates";

function certificateIdentity(data: any) {
  const subject = data?.certificate_subject || "";
  const cn = subject.match(/(?:^|,)CN=([^,]+)/)?.[1] || subject;
  const subjectDocument = cn.match(/(\d{14}|\d{11})/)?.[1] || "";
  const document = subjectDocument.length > (data?.certificate_document || "").length
    ? subjectDocument
    : data?.certificate_document || "";
  const name = data?.certificate_name || cn.split(":")[0].trim();
  return { name, document };
}

function formatDocument(document: string) {
  if (/^\d{14}$/.test(document)) {
    return document.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  }
  if (/^\d{11}$/.test(document)) {
    return document.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  }
  return document;
}

export default function VerifyCodePage() {
  const params = useParams();
  const code = params.codigo as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const certificate = certificateIdentity(data);

  useEffect(() => {
    api.verify(code)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [code]);

  return (
    <main className="min-h-[calc(100vh-160px)] bg-surface py-stack-lg">
      <div className="max-w-[800px] mx-auto px-margin-mobile flex flex-col items-center">
        {/* Trust Banner */}
        <div className="w-full mb-stack-md flex items-center justify-center gap-3 bg-secondary-container/30 border border-secondary/20 py-3 px-6 rounded-full">
          <span
            className="material-symbols-outlined text-on-secondary-container"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            verified_user
          </span>
          <span className="text-on-secondary-container font-label-md text-label-md tracking-wider">
            ASSINATURA DIGITAL DE CONFIANÇA - PADRÃO ICP-BRASIL
          </span>
        </div>

        <section className="w-full bg-surface-container-lowest rounded-xl border border-outline-variant shadow-xl overflow-hidden">
          <div className="p-stack-md md:p-12">
            <div className="text-center mb-6">
              <span className="material-symbols-outlined text-5xl mb-4 block text-primary">
                qr_code_scanner
              </span>
              <h1 className="text-headline-lg font-headline-lg text-primary mb-2">
                Resultado da Verificação
              </h1>
              <p className="text-body-sm text-on-surface-variant font-mono bg-surface-container-low inline-block px-4 py-1.5 rounded-full">
                Código: {code}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="px-8 pb-8 text-center text-on-surface-variant">
              <span className="material-symbols-outlined text-4xl mb-3 block animate-spin">
                progress_activity
              </span>
              <p>Verificando assinatura digital...</p>
            </div>
          ) : error ? (
            <div className="border-t border-outline-variant p-8">
              <div className="flex items-start gap-4 bg-error-container text-on-error-container p-6 rounded-xl">
                <span className="material-symbols-outlined shrink-0">error</span>
                <div>
                  <h3 className="font-headline-sm text-headline-sm mb-1">
                    Erro na Verificação
                  </h3>
                  <p className="text-body-sm">{error}</p>
                </div>
              </div>
            </div>
          ) : data && data.valid ? (
            <div className="border-t border-outline-variant p-8">
              <div className="bg-secondary-container/20 border border-secondary/30 rounded-xl p-6 mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <span
                    className="material-symbols-outlined text-secondary"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    check_circle
                  </span>
                  <h3 className="font-headline-sm text-headline-sm text-primary">
                    Assinatura Válida
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-body-sm">
                  {data.edition_title && (
                    <div>
                      <span className="text-on-surface-variant">Documento:</span>
                      <p className="font-semibold text-primary">{data.edition_title}</p>
                    </div>
                  )}
                  {data.edition_year && data.edition_number && (
                    <div>
                      <span className="text-on-surface-variant">Edição:</span>
                      <p className="font-semibold text-primary">
                        {data.edition_year}/{String(data.edition_number).padStart(3, "0")}
                      </p>
                    </div>
                  )}
                  {data.publication_date && (
                    <div>
                      <span className="text-on-surface-variant">Publicação:</span>
                      <p className="font-semibold text-primary">
                        {new Date(data.publication_date + "T00:00:00").toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                  )}
                  {data.certificate_subject && (
                    <div className="min-w-0">
                      <span className="text-on-surface-variant">Certificado:</span>
                      <p className="font-semibold text-primary break-words">{certificate.name}</p>
                      {certificate.document && (
                        <p className="text-primary font-mono text-sm break-all">
                          {formatDocument(certificate.document)}
                        </p>
                      )}
                    </div>
                  )}
                  {data.signed_at && (
                    <div>
                      <span className="text-on-surface-variant">Assinado em:</span>
                      <p className="font-semibold text-primary">
                        {formatBrasiliaDateTime(data.signed_at)}
                      </p>
                    </div>
                  )}
                  {data.immutability_hash && (
                    <div className="md:col-span-2">
                      <span className="text-on-surface-variant">Hash de imutabilidade:</span>
                      <code className="block bg-surface-container mt-1 px-3 py-1.5 rounded text-xs font-mono break-all text-primary">
                        {data.immutability_hash}
                      </code>
                    </div>
                  )}
                </div>
              </div>

              {/* QR Code */}
              <div className="text-center">
                <p className="text-label-md font-label-md text-on-surface-variant mb-3">
                  QR Code de Verificação
                </p>
                <div className="inline-block bg-white border border-outline-variant p-2 rounded-xl">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(`${window.location.origin}/verificar/${code}`)}`}
                    alt="QR Code"
                    className="w-36 h-36"
                  />
                </div>
              </div>
            </div>
          ) : data && !data.valid ? (
            <div className="border-t border-outline-variant p-8">
              <div className="flex items-start gap-4 bg-error-container text-on-error-container p-6 rounded-xl">
                <span className="material-symbols-outlined shrink-0">error</span>
                <div>
                  <h3 className="font-headline-sm text-headline-sm mb-1">
                    Código Não Encontrado
                  </h3>
                  <p className="text-body-sm">
                    {data.message || "O código informado não corresponde a nenhum documento válido."}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {/* Trust Reasons */}
          <div className="bg-surface-container-low border-t border-outline-variant p-8 md:p-10">
            <h3 className="text-label-md font-label-md text-on-surface-variant mb-6 text-center uppercase tracking-widest">
              Por que verificar?
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center mb-3 shadow-sm border border-outline-variant">
                  <span className="material-symbols-outlined text-secondary">gavel</span>
                </div>
                <h4 className="font-headline-sm text-sm text-primary mb-1">Validade Jurídica</h4>
                <p className="text-body-sm text-on-surface-variant">
                  Garante que o ato administrativo possui plena força legal e fé pública.
                </p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center mb-3 shadow-sm border border-outline-variant">
                  <span className="material-symbols-outlined text-secondary">security</span>
                </div>
                <h4 className="font-headline-sm text-sm text-primary mb-1">Integridade</h4>
                <p className="text-body-sm text-on-surface-variant">
                  Assegura que o conteúdo não foi alterado após a sua publicação original.
                </p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center mb-3 shadow-sm border border-outline-variant">
                  <span className="material-symbols-outlined text-secondary">history_edu</span>
                </div>
                <h4 className="font-headline-sm text-sm text-primary mb-1">Autenticidade</h4>
                <p className="text-body-sm text-on-surface-variant">
                  Confirma a autoria do órgão emissor através de certificados digitais seguros.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Navigation */}
        <div className="w-full mt-stack-lg text-center">
          <Link
            href="/verificar"
            className="text-primary font-label-md text-label-md hover:underline flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Verificar outro código
          </Link>
        </div>
      </div>
    </main>
  );
}
