"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { formatBrasiliaDateTime } from "@/lib/dates";
import ShareDialog from "@/components/ShareDialog";

const WEEKDAYS = [
  "DOMINGO", "SEGUNDA-FEIRA", "TERÇA-FEIRA", "QUARTA-FEIRA",
  "QUINTA-FEIRA", "SEXTA-FEIRA", "SÁBADO",
];
const MONTHS = [
  "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
  "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO",
];
const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "/api/v1").replace(/\/api\/v1\/?$/, "/api/v1");

function formatHeaderDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return `${WEEKDAYS[date.getDay()]}, ${String(date.getDate()).padStart(2, "0")} DE ${MONTHS[date.getMonth()]} DE ${date.getFullYear()}`;
}

function certificateName(subject?: string) {
  const cn = subject?.match(/CN=([^,]+)/)?.[1] || subject || "MUNICÍPIO DE FAROL";
  return cn.split(":")[0].trim().replace(/^MUNICIPIO\b/i, "MUNICÍPIO").toUpperCase();
}

function toDirectPdfUrl(pdfUrl: string) {
  if (pdfUrl.startsWith("/api/download/")) {
    const filePath = pdfUrl.replace(/^\/api\/download\//, "");
    return `${API_BASE}/public/download/${filePath}`;
  }
  return pdfUrl;
}

export default function EditionDetailPage() {
  const params = useParams();
  const year = Number(params.ano);
  const number = Number(params.numero);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getEdition(year, number).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [year, number]);

  if (loading) {
    return (
      <main className="max-w-container-max mx-auto px-gutter py-stack-lg min-h-screen flex items-center justify-center">
        <div className="text-center text-on-surface-variant">
          <span className="material-symbols-outlined text-4xl mb-4 block animate-spin">progress_activity</span>
          <p className="text-body-md">Carregando edição...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="max-w-container-max mx-auto px-gutter py-stack-lg min-h-screen flex items-center justify-center">
        <div className="text-center">
          <span className="material-symbols-outlined text-4xl mb-4 block text-error">error</span>
          <p className="text-body-md text-error">{error}</p>
        </div>
      </main>
    );
  }

  if (!data) return null;

  const summaryItems = (data.items || []).map((item: any, idx: number) => ({
    id: `matter-${item.id}`,
    position: item.position ?? idx + 1,
    title: item.matter?.title || item.matter_title || "Matéria",
    sectionTitle: item.section_title || "",
    actType: item.matter?.act_type || "",
    orgUnit: item.matter?.org_unit || "",
  }));

  const signature = data.signatures?.[0];
  const verificationCode = data.verification_code || signature?.verification_code;
  const directPdfUrl = data.pdf_url ? toDirectPdfUrl(data.pdf_url) : null;

  return (
    <main className="w-full mx-auto px-gutter py-stack-lg min-h-screen">
      {/* Document Tools */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-stack-md gap-4 no-print max-w-[1680px] mx-auto">
        <div className="flex flex-col">
          <h1 className="text-headline-md font-headline-md text-primary">Visualização de Edição</h1>
          <p className="text-body-sm font-body-sm text-on-surface-variant">
            Edição Digital nº {data.number} • Ano {data.year}
          </p>
        </div>
        <div className="flex gap-3">
          {directPdfUrl && (
            <>
              <a
                href={`${directPdfUrl}${directPdfUrl.includes("?") ? "&" : "?"}inline=1`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-6 py-2.5 bg-primary text-on-primary font-bold rounded hover:opacity-90 transition-all"
              >
                <span className="material-symbols-outlined text-[20px]">visibility</span>
                <span className="text-label-md font-label-md">Visualizar PDF</span>
              </a>
              <a
                href={directPdfUrl}
                download
                className="flex items-center gap-2 px-6 py-2.5 bg-surface-container-high border border-outline-variant text-primary font-bold rounded hover:bg-surface-container-highest transition-all"
              >
                <span className="material-symbols-outlined text-[20px]">download</span>
                <span className="text-label-md font-label-md">Baixar PDF</span>
              </a>
            </>
          )}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-6 py-2.5 bg-surface-container-high border border-outline-variant text-primary font-bold rounded hover:bg-surface-container-highest transition-all"
          >
            <span className="material-symbols-outlined text-[20px]">print</span>
            <span className="text-label-md font-label-md">Imprimir Edição</span>
          </button>
          <ShareDialog
            url={typeof window !== "undefined" ? window.location.href : ""}
            title={`Edição ${data.number}/${data.year} - Diário Oficial`}
          />
          {verificationCode && (
            <Link
              href={`/verificar/${verificationCode}`}
              className="flex items-center gap-2 px-6 py-2.5 bg-primary text-on-primary font-bold rounded hover:opacity-90 transition-all"
            >
              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
              <span className="text-label-md font-label-md">Verificar Autenticidade</span>
            </Link>
          )}
        </div>
      </div>

      {directPdfUrl && (
        <section className="flex flex-col xl:flex-row gap-5 mb-stack-lg no-print max-w-[1680px] mx-auto">
          {signature && (
            <aside className="w-full xl:w-72 2xl:w-80 shrink-0 xl:order-first">
              <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 sticky top-24 space-y-5">
                <h4 className="text-title-md font-title-md text-primary flex items-center gap-2">
                  <span className="material-symbols-outlined">verified_user</span>
                  Assinatura Digital
                </h4>

                <div className="space-y-4 text-body-sm font-body-sm">
                  <div>
                    <span className="text-label-md font-label-md text-outline uppercase tracking-wide">Certificado</span>
                    <p className="text-on-surface font-semibold mt-0.5 break-words">
                      {(() => {
                        const sub = signature.certificate_subject || "";
                        const cn = sub.match(/CN=([^,]+)/)?.[1] || sub;
                        return cn.split(":")[0].trim().replace(/^MUNICIPIO\b/i, "MUNICÍPIO").toUpperCase();
                      })()}
                    </p>
                  </div>

                  {(() => {
                    const sub = signature.certificate_subject || "";
                    const cn = sub.match(/CN=([^,]+)/)?.[1] || sub;
                    const parts = cn.split(":");
                    const doc = parts.length > 1 ? parts[parts.length - 1].replace(/[^0-9]/g, "") : "";
                    if (doc) {
                      const formatted = doc.length === 11
                        ? doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
                        : doc.length === 14
                        ? doc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
                        : doc;
                      return (
                        <div>
                          <span className="text-label-md font-label-md text-outline uppercase tracking-wide">CPF/CNPJ</span>
                          <p className="text-on-surface font-semibold mt-0.5">{formatted}</p>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {signature.certificate_serial && (
                    <div>
                      <span className="text-label-md font-label-md text-outline uppercase tracking-wide">Número de Série</span>
                      <p className="text-on-surface font-mono text-[12px] mt-0.5 break-all">{signature.certificate_serial}</p>
                    </div>
                  )}

                  {signature.signed_at && (
                    <div>
                      <span className="text-label-md font-label-md text-outline uppercase tracking-wide">Assinado em</span>
                      <p className="text-on-surface font-semibold mt-0.5">
                        {formatBrasiliaDateTime(signature.signed_at)}
                      </p>
                    </div>
                  )}

                  {verificationCode && (
                    <div className="pt-3 border-t border-outline-variant/50">
                      <span className="text-label-md font-label-md text-outline uppercase tracking-wide">Código de Verificação</span>
                      <p className="text-on-surface font-mono text-[13px] mt-0.5 break-all font-bold">{verificationCode}</p>
                    </div>
                  )}
                </div>
              </div>
            </aside>
          )}

          <div className="bg-white flex-1 min-w-0 min-h-[calc(100vh-220px)] shadow-lg border border-outline-variant/30 rounded-lg overflow-hidden">
            <iframe
              title={`PDF oficial da edição ${data.number}/${data.year}`}
              src={`${directPdfUrl}${directPdfUrl.includes("?") ? "&" : "?"}inline=1`}
              className="w-full h-full min-h-[calc(100vh-220px)]"
            />
          </div>
        </section>
      )}

      <article className={`bg-white mx-auto max-w-[900px] min-h-[1200px] p-8 md:p-16 flex flex-col shadow-lg border border-outline-variant/30 ${directPdfUrl ? "print-only" : ""}`}>
        {/* Document Header */}
        <header className="text-center mb-10 pb-8 border-b-2 border-primary-container">
          <div className="flex justify-center mb-6">
            <img alt="Brasão do Município de Farol" className="h-32 w-auto mx-auto" src="/brasao.png" />
          </div>
          <h2 className="text-display-lg font-display-lg text-primary tracking-tighter uppercase mb-1">
            Diário Oficial Eletrônico
          </h2>
          <h3 className="text-headline-sm font-headline-sm text-on-surface-variant font-bold mb-8">
            MUNICÍPIO DE FAROL
          </h3>
          <div className="grid grid-cols-3 gap-0 border-y border-outline-variant py-3 mt-4 text-label-md font-label-md uppercase tracking-wider text-on-surface-variant">
            <div className="text-left">{formatHeaderDate(data.publication_date)}</div>
            <div className="text-center font-bold text-primary">ANO: {data.year}</div>
            <div className="text-right">EDIÇÃO Nº: {data.number} Pág.(s)</div>
          </div>
          {data.subtitle && (
            <p className="mt-4 text-center text-body-sm text-on-surface-variant">{data.subtitle}</p>
          )}
        </header>

        {/* Digital Signature Banner */}
        <div className="bg-secondary-container/30 border border-secondary/20 rounded-lg p-4 mb-10 flex items-center gap-3">
          <span className="material-symbols-outlined text-secondary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
          <p className="text-body-sm font-body-sm text-on-secondary-container">
            Assinado digitalmente por{" "}
            <span className="font-bold">
              {certificateName(signature?.certificate_subject || signature?.certificate_info?.subject)} | {verificationCode}
            </span>
          </p>
        </div>

        {/* Summary */}
        {summaryItems.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center gap-4 mb-6">
              <div className="h-[1px] flex-grow bg-outline-variant" />
              <h4 className="text-headline-sm font-headline-sm text-primary uppercase tracking-[0.2em]">Sumário</h4>
              <div className="h-[1px] flex-grow bg-outline-variant" />
            </div>
            <ul className="space-y-4">
              {summaryItems.map((item: any) => (
                <li key={item.id} className="group">
                  <a
                    href={`#${item.id}`}
                    className="flex justify-between items-end gap-2 text-primary hover:text-secondary-container transition-colors"
                  >
                    <div className="flex flex-col">
                      <span className="font-bold text-body-md font-body-md uppercase group-hover:underline">
                        {item.title}
                      </span>
                      <span className="text-on-surface-variant text-body-sm font-body-sm">
                        {[item.actType, item.orgUnit, item.sectionTitle].filter(Boolean).join(" • ")}
                      </span>
                    </div>
                    <div className="flex-grow border-b border-dotted border-outline-variant mb-1 mx-2" />
                    <span className="font-bold text-body-md font-body-md">{String(item.position).padStart(2, "0")}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Content */}
        <div className="space-y-16">
          {(data.items || []).map((item: any, idx: number) => (
            <section key={item.id} id={`matter-${item.id}`} className="scroll-mt-24 border-t-2 border-surface-container-highest pt-10">
              {item.section_title && (idx === 0 || data.items[idx - 1]?.section_title !== item.section_title) && (
                <h2 className="bg-surface-container-low px-6 py-2 inline-block font-bold text-primary border border-outline-variant mb-8 mx-auto text-center w-full max-w-xs uppercase">
                  {item.section_title}
                </h2>
              )}

              <div className="bg-surface-container-low px-6 py-2 inline-block font-bold text-primary border border-outline-variant mb-8 mx-auto text-center w-full max-w-xs uppercase">
                {item.matter?.title || item.matter_title || "Matéria"}
              </div>

              <div className="space-y-8 text-on-surface">
                {item.matter?.summary && (
                  <h5 className="text-body-lg font-body-lg font-bold text-center leading-relaxed max-w-2xl mx-auto uppercase">
                    {item.matter.summary}
                  </h5>
                )}

                <div className="space-y-6 text-body-md font-body-md leading-relaxed text-justify">
                  <div
                    className="prose max-w-none text-on-surface prose-p:my-3 prose-p:text-justify prose-p:text-body-md prose-p:leading-relaxed prose-strong:font-bold prose-headings:text-center prose-headings:uppercase"
                    dangerouslySetInnerHTML={{ __html: item.matter?.content_html || "" }}
                  />
                </div>
              </div>

            </section>
          ))}
        </div>

        {/* Document Footer Validation */}
        <footer className="mt-auto pt-12 border-t border-outline-variant/50">
          <div className="bg-surface-container-lowest border border-outline-variant rounded p-6 text-body-sm font-body-sm text-on-surface-variant">
            <div className="flex items-center gap-2 mb-3 text-primary font-bold">
              <span className="material-symbols-outlined text-[18px]">verified_user</span>
              <span className="text-label-md font-label-md">Validação do Documento</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {verificationCode && (
                <div className="flex flex-col">
                  <span className="text-label-md font-label-md uppercase opacity-60">Código de verificação</span>
                  <span className="font-mono bg-surface p-1 rounded border border-outline-variant">{verificationCode}</span>
                </div>
              )}
              {data.pdf_hash && (
                <div className="flex flex-col">
                  <span className="text-label-md font-label-md uppercase opacity-60">SHA-256 do PDF</span>
                  <span className="font-mono bg-surface p-1 rounded border border-outline-variant text-[11px] break-all">{data.pdf_hash}</span>
                </div>
              )}
            </div>

          </div>
        </footer>
      </article>
    </main>
  );
}
