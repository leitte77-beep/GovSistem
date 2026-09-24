"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
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

export default function VerificarPage() {
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const certificate = certificateIdentity(result);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const c = params.get("codigo");
    if (c) setCode(c);
  }, []);

  const handleVerify = useCallback(async () => {
    const c = code.trim().toUpperCase();
    if (!c) {
      setError("Informe o código de validação.");
      return;
    }
    setVerifying(true);
    setResult(null);
    setError(null);
    try {
      const res = await api.verify(c);
      if (!res.valid) {
        setResult(res);
      } else {
        setResult(res);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao verificar o documento.");
    } finally {
      setVerifying(false);
    }
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

        {/* Main Verification Card */}
        <section className="w-full bg-surface-container-lowest rounded-xl border border-outline-variant shadow-xl overflow-hidden">
          <div className="p-stack-md md:p-12">
            <div className="text-center mb-10">
              <h1 className="text-headline-lg font-headline-lg text-primary mb-4">
                Verificar Assinatura Digital
              </h1>
              <p className="text-on-surface-variant max-w-[500px] mx-auto text-body-md">
                Utilize esta ferramenta para validar a autenticidade jurídica
                e a integridade de documentos publicados no Diário Oficial.
              </p>
            </div>

            <div className="max-w-[500px] mx-auto space-y-8">
              {/* Validation Input */}
              <div className="space-y-3">
                <label
                  className="block text-label-md font-label-md text-on-surface-variant ml-1"
                  htmlFor="validation_code"
                >
                  CÓDIGO DE VALIDAÇÃO
                </label>
                <div className="relative group">
                  <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline group-focus-within:text-primary transition-colors">
                    qr_code_scanner
                  </span>
                  <input
                    className="w-full h-14 pl-12 pr-4 bg-surface-bright border border-outline-variant rounded-lg focus:border-primary focus:ring-1 focus:ring-primary transition-all text-body-lg font-mono placeholder:text-outline/50 placeholder:font-sans outline-none uppercase"
                    id="validation_code"
                    placeholder="Ex: 20260001-590AC033"
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                  />
                </div>
                <p className="text-body-sm text-outline ml-1">
                  O código encontra-se impresso no rodapé ou na lateral do
                  documento oficial.
                </p>
              </div>

              {/* Action Button */}
              <button
                onClick={handleVerify}
                disabled={verifying || !code.trim()}
                className="w-full h-14 bg-primary text-on-primary font-headline-sm rounded-lg hover:bg-primary-container hover:shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
              >
                {verifying ? (
                  <>
                    <span className="material-symbols-outlined animate-spin">
                      progress_activity
                    </span>
                    Validando...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined">verified</span>
                    Verificar Documento
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Result */}
          {(result || error) && (
            <div className="border-t border-outline-variant p-8 md:p-10">
              {error && (
                <div className="flex items-start gap-4 bg-error-container text-on-error-container p-6 rounded-xl">
                  <span className="material-symbols-outlined shrink-0">
                    error
                  </span>
                  <div>
                    <h3 className="font-headline-sm text-headline-sm mb-1">
                      Erro na Verificação
                    </h3>
                    <p className="text-body-sm">{error}</p>
                  </div>
                </div>
              )}

              {result && result.valid && (
                <div className="bg-secondary-container/20 border border-secondary/30 rounded-xl p-6">
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
                    {result.edition_title && (
                      <div>
                        <span className="text-on-surface-variant">
                          Documento:
                        </span>
                        <p className="font-semibold text-primary">
                          {result.edition_title}
                        </p>
                      </div>
                    )}
                    {result.edition_year && result.edition_number && (
                      <div>
                        <span className="text-on-surface-variant">
                          Edição:
                        </span>
                        <p className="font-semibold text-primary">
                          {result.edition_year}/
                          {String(result.edition_number).padStart(3, "0")}
                        </p>
                      </div>
                    )}
                    {result.publication_date && (
                      <div>
                        <span className="text-on-surface-variant">
                          Publicação:
                        </span>
                        <p className="font-semibold text-primary">
                          {new Date(
                            result.publication_date + "T00:00:00",
                          ).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                    )}
                    {result.certificate_subject && (
                      <div className="min-w-0">
                        <span className="text-on-surface-variant">
                          Certificado:
                        </span>
                        <p className="font-semibold text-primary break-words">{certificate.name}</p>
                        {certificate.document && (
                          <p className="text-primary font-mono text-sm break-all">
                            {formatDocument(certificate.document)}
                          </p>
                        )}
                      </div>
                    )}
                    {result.signed_at && (
                      <div>
                        <span className="text-on-surface-variant">
                          Assinado em:
                        </span>
                        <p className="font-semibold text-primary">
                          {formatBrasiliaDateTime(result.signed_at)}
                        </p>
                      </div>
                    )}
                    {result.immutability_hash && (
                      <div className="md:col-span-2">
                        <span className="text-on-surface-variant">
                          Hash de imutabilidade:
                        </span>
                        <code className="block bg-surface-container mt-1 px-3 py-1.5 rounded text-xs font-mono break-all text-primary">
                          {result.immutability_hash}
                        </code>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {result && !result.valid && (
                <div className="flex items-start gap-4 bg-error-container text-on-error-container p-6 rounded-xl">
                  <span className="material-symbols-outlined shrink-0">
                    error
                  </span>
                  <div>
                    <h3 className="font-headline-sm text-headline-sm mb-1">
                      Código Não Encontrado
                    </h3>
                    <p className="text-body-sm">
                      {result.message ||
                        "O código informado não corresponde a nenhum documento válido. Verifique se todos os caracteres foram digitados corretamente."}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Trust Reasons */}
          <div className="bg-surface-container-low border-t border-outline-variant p-8 md:p-10">
            <h3 className="text-label-md font-label-md text-on-surface-variant mb-6 text-center uppercase tracking-widest">
              Por que verificar?
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center mb-3 shadow-sm border border-outline-variant">
                  <span className="material-symbols-outlined text-secondary">
                    gavel
                  </span>
                </div>
                <h4 className="font-headline-sm text-sm text-primary mb-1">
                  Validade Jurídica
                </h4>
                <p className="text-body-sm text-on-surface-variant">
                  Garante que o ato administrativo possui plena força legal e
                  fé pública.
                </p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center mb-3 shadow-sm border border-outline-variant">
                  <span className="material-symbols-outlined text-secondary">
                    security
                  </span>
                </div>
                <h4 className="font-headline-sm text-sm text-primary mb-1">
                  Integridade
                </h4>
                <p className="text-body-sm text-on-surface-variant">
                  Assegura que o conteúdo não foi alterado após a sua
                  publicação original.
                </p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center mb-3 shadow-sm border border-outline-variant">
                  <span className="material-symbols-outlined text-secondary">
                    history_edu
                  </span>
                </div>
                <h4 className="font-headline-sm text-sm text-primary mb-1">
                  Autenticidade
                </h4>
                <p className="text-body-sm text-on-surface-variant">
                  Confirma a autoria do órgão emissor através de certificados
                  digitais seguros.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="w-full mt-stack-lg">
          <div className="bg-surface-container-low rounded-xl border border-outline-variant p-8 md:p-10">
            <div className="flex items-center gap-3 mb-8">
              <span className="material-symbols-outlined text-primary">
                quiz
              </span>
              <h2 className="text-headline-sm font-headline-sm text-primary">
                Dúvidas Frequentes
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <h3 className="font-label-md text-label-md text-primary uppercase tracking-wider">
                  Onde encontro o código?
                </h3>
                <p className="text-body-sm text-on-surface-variant">
                  O código alfanumérico está impresso no rodapé ou na margem
                  lateral de todos os documentos oficiais emitidos
                  digitalmente.
                </p>
              </div>
              <div className="space-y-2">
                <h3 className="font-label-md text-label-md text-primary uppercase tracking-wider">
                  O que é o ICP-Brasil?
                </h3>
                <p className="text-body-sm text-on-surface-variant">
                  É a Infraestrutura de Chaves Públicas Brasileira, uma cadeia
                  hierárquica que viabiliza a emissão de certificados digitais
                  para identificação virtual.
                </p>
              </div>
              <div className="space-y-2">
                <h3 className="font-label-md text-label-md text-primary uppercase tracking-wider">
                  Qual a validade da certidão?
                </h3>
                <p className="text-body-sm text-on-surface-variant">
                  A validade jurídica do documento é permanente, desde que sua
                  assinatura digital seja verificada com sucesso nesta
                  plataforma oficial.
                </p>
              </div>
              <div className="space-y-2">
                <h3 className="font-label-md text-label-md text-primary uppercase tracking-wider">
                  O código não funciona?
                </h3>
                <p className="text-body-sm text-on-surface-variant">
                  Verifique se todos os caracteres foram digitados
                  corretamente. Caso o erro persista, entre em contato com o
                  suporte técnico.
                </p>
              </div>
            </div>
            <div className="mt-8 pt-6 border-t border-outline-variant/50 text-center">
              <Link
                href="/contato"
                className="text-body-sm text-primary font-semibold hover:underline flex items-center justify-center gap-2"
              >
                Ver Central de Ajuda Completa
                <span className="material-symbols-outlined text-sm">
                  arrow_forward
                </span>
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
