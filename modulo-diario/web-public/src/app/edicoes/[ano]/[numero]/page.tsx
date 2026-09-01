"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useOrg } from "@/lib/org-context";
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

function formatHeaderDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return `${WEEKDAYS[date.getDay()]}, ${String(date.getDate()).padStart(2, "0")} DE ${MONTHS[date.getMonth()]} DE ${date.getFullYear()}`;
}

function slugify(text: string): string {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function matterAnchor(m: any, idx: number): string {
  if (m.anchor) return m.anchor;
  const base = slugify(m.title || `materia-${idx + 1}`);
  return `materia-${m.id || `${base}-${idx + 1}`}`;
}

type Authenticity = {
  verification_code: string;
  signed_pdf_hash: string | null;
  content_manifest_hash: string | null;
  snapshot_intact: boolean;
  snapshot_status?: string;
  states: { signed: boolean; intact: boolean; trusted: boolean };
  signatures: any[];
};

export default function EditionDetailPage() {
  const params = useParams();
  const { org } = useOrg();
  const year = Number(params.ano);
  const number = Number(params.numero);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [legacy, setLegacy] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);

  const pageUrl = typeof window !== "undefined" ? window.location.href : "";

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.getEditionSnapshot(year, number);
        if (active) setSnapshot(res);
      } catch {
        try {
          const fallback = await api.getEdition(year, number);
          if (active) setLegacy(fallback);
        } catch (e: any) {
          if (active) setError(e?.message || "Não foi possível carregar a edição");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [year, number]);

  const edition = snapshot?.edition || legacy || null;
  const authenticity: Authenticity | null = snapshot?.authenticity || null;
  const pdfUrl = snapshot
    ? api.editionDownloadUrl(year, number)
    : legacy?.pdf_url;

  const matters = useMemo<any[]>(() => snapshot?.matters || legacy?.items || [], [snapshot, legacy]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return matters;
    return matters.filter((m: any) =>
      `${m.title || ""} ${m.summary || ""} ${m.section_title || ""}`.toLowerCase().includes(q)
    );
  }, [matters, query]);

  const copyLink = () => {
    navigator.clipboard?.writeText(pageUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-container-max px-gutter py-stack-lg min-h-screen flex items-center justify-center">
        <div className="text-center text-on-surface-variant">
          <span className="material-symbols-outlined text-4xl mb-4 block animate-spin">progress_activity</span>
          <p className="text-body-md">Carregando edição…</p>
        </div>
      </main>
    );
  }

  if (error || !edition) {
    return (
      <main className="mx-auto max-w-container-max px-gutter py-stack-lg min-h-screen flex items-center justify-center">
        <div className="text-center">
          <span className="material-symbols-outlined text-4xl mb-4 block text-error">error</span>
          <p className="text-body-md text-error">{error || "Edição não encontrada"}</p>
          <Link href="/edicoes" className="text-primary hover:underline text-sm mt-2 inline-block">← Voltar para edições</Link>
        </div>
      </main>
    );
  }

  const sig = authenticity?.signatures?.[0] || legacy?.signatures?.[0];
  const verificationCode = authenticity?.verification_code || legacy?.verification_code;
  const stateLabel = authenticity
    ? authenticity.states.trusted
      ? "Assinatura válida e confiável"
      : authenticity.states.intact
        ? "Integridade válida, cadeia não verificada"
        : "Validação indisponível"
    : null;

  return (
    <main className="w-full mx-auto px-gutter py-stack-lg min-h-screen">
      {/* Notice: HTML representation vs official PDF */}
      <div className="mb-6 rounded-xl border border-primary/20 bg-primary-fixed/10 p-4 text-sm text-on-surface-variant no-print">
        <p className="flex items-start gap-2">
          <span className="material-symbols-outlined text-primary shrink-0">info</span>
          <span>
            <strong>Representação HTML da edição oficial.</strong> Para obter o documento
            assinado digitalmente, baixe o <strong>PDF oficial</strong>. Esta página é
            renderizada a partir de um <strong>snapshot imutável</strong> da edição.
          </span>
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-stack-md gap-4 no-print max-w-[1680px] mx-auto">
        <div className="flex flex-col">
          <h1 className="text-headline-md font-headline-md text-primary">
            Diário Oficial Eletrônico — Edição {number}
          </h1>
          <p className="text-body-sm font-body-sm text-on-surface-variant">
            Ano {year} · {edition.type} · {edition.publication_date ? formatHeaderDate(edition.publication_date) : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {pdfUrl && (
            <a href={pdfUrl} download
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-on-primary font-bold rounded-lg hover:opacity-90 transition-all">
              <span className="material-symbols-outlined text-[20px]">download</span>
              <span className="text-label-md">Baixar PDF oficial</span>
            </a>
          )}
          <button onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2.5 bg-surface-container-high border border-outline-variant text-primary font-bold rounded-lg hover:bg-surface-container-highest">
            <span className="material-symbols-outlined text-[20px]">print</span>
            <span className="text-label-md">Imprimir</span>
          </button>
          <button onClick={copyLink}
            className="flex items-center gap-2 px-4 py-2.5 bg-surface-container-high border border-outline-variant text-primary font-bold rounded-lg hover:bg-surface-container-highest">
            <span className="material-symbols-outlined text-[20px]">{copied ? "check" : "link"}</span>
            <span className="text-label-md">{copied ? "Copiado!" : "Copiar link"}</span>
          </button>
          <ShareDialog url={pageUrl} title={`Edição ${number}/${year} - Diário Oficial`} />
          {verificationCode && (
            <Link href={`/verificar/${verificationCode}`}
              className="flex items-center gap-2 px-4 py-2.5 bg-surface-container-high border border-outline-variant text-primary font-bold rounded-lg hover:bg-surface-container-highest">
              <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>verified</span>
              <span className="text-label-md">Verificar autenticidade</span>
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-5 max-w-[1680px] mx-auto">
        {/* Authenticity / sidebar */}
        <aside className="w-full xl:w-80 shrink-0 xl:order-last no-print">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-5 sticky top-24 space-y-5">
            <h2 className="text-title-md font-title-md text-primary flex items-center gap-2">
              <span className="material-symbols-outlined">verified_user</span>
              Painel de Autenticidade
            </h2>

            {authenticity && (
              <div className="space-y-2 text-body-sm">
                <StatusRow label="Arquivo assinado" ok={authenticity.states.signed} />
                <StatusRow label="Integridade criptográfica" ok={authenticity.states.intact} />
                <StatusRow label="Cadeia verificada" ok={authenticity.states.trusted} />
                <StatusRow label="Snapshot imutável íntegro" ok={authenticity.snapshot_intact} />
                {stateLabel && (
                  <p className="pt-2 text-xs font-semibold text-on-surface-variant">{stateLabel}</p>
                )}
              </div>
            )}

            {sig && (
              <div className="space-y-4 text-body-sm border-t border-outline-variant pt-4">
                <div>
                  <span className="text-label-md text-outline uppercase">Assinante</span>
                  <p className="text-on-surface font-semibold mt-0.5 break-words">
                    {(sig.subject || "").split(":").slice(0, 1).join("").replace(/^CN=/, "")}
                  </p>
                </div>
                {sig.serial_masked && (
                  <div>
                    <span className="text-label-md text-outline uppercase">Número de série</span>
                    <p className="text-on-surface font-mono text-[12px] mt-0.5">{sig.serial_masked}</p>
                  </div>
                )}
                {sig.signed_at && (
                  <div>
                    <span className="text-label-md text-outline uppercase">Assinado em</span>
                    <p className="text-on-surface font-semibold mt-0.5">{formatBrasiliaDateTime(sig.signed_at)}</p>
                  </div>
                )}
              </div>
            )}

            {verificationCode && (
              <div className="border-t border-outline-variant pt-4">
                <span className="text-label-md text-outline uppercase">Código de verificação</span>
                <p className="text-on-surface font-mono text-[13px] mt-0.5 break-all font-bold">{verificationCode}</p>
              </div>
            )}

            {authenticity?.signed_pdf_hash && (
              <div className="border-t border-outline-variant pt-4">
                <span className="text-label-md text-outline uppercase">SHA-256 do PDF assinado</span>
                <p className="text-on-surface font-mono text-[11px] mt-0.5 break-all">{authenticity.signed_pdf_hash}</p>
              </div>
            )}
            {authenticity?.content_manifest_hash && (
              <div className="border-t border-outline-variant pt-4">
                <span className="text-label-md text-outline uppercase">Manifesto de conteúdo</span>
                <p className="text-on-surface font-mono text-[11px] mt-0.5 break-all">{authenticity.content_manifest_hash}</p>
              </div>
            )}
          </div>
        </aside>

        {/* Content */}
        <article className="flex-1 min-w-0">
          {/* Institutional header */}
          <header className="text-center mb-8 pb-8 border-b-2 border-primary-container">
            <div className="flex justify-center mb-4">
              <Image alt={org?.name ? `Brasão de ${org.name}` : "Brasão do Município"}
                className="h-24 w-auto mx-auto" src={org?.logo_url || "/brasao.png"} width={96} height={96} />
            </div>
            <h2 className="text-display-lg font-display-lg text-primary tracking-tighter uppercase mb-1">
              Diário Oficial Eletrônico
            </h2>
            <h3 className="text-headline-sm font-headline-sm text-on-surface-variant font-bold">
              {edition.organization?.toUpperCase() || org?.name?.toUpperCase() || "MUNICÍPIO"}
            </h3>
            <div className="grid grid-cols-3 gap-0 border-y border-outline-variant py-3 mt-4 text-label-md uppercase tracking-wider text-on-surface-variant">
              <div className="text-left">{formatHeaderDate(edition.publication_date)}</div>
              <div className="text-center font-bold text-primary">ANO: {year}</div>
              <div className="text-right">EDIÇÃO Nº: {number}</div>
            </div>
            {edition.subtitle && <p className="mt-4 text-center text-body-sm text-on-surface-variant">{edition.subtitle}</p>}
          </header>

          {/* Search + TOC */}
          <section className="mb-8 no-print" aria-label="Navegação da edição">
            <label className="flex items-center gap-2 bg-surface-container-low rounded-xl px-3 py-2 border border-outline-variant mb-4">
              <span className="material-symbols-outlined text-on-surface-variant">search</span>
              <span className="sr-only">Pesquisar nesta edição</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Pesquisar nesta edição…"
                className="bg-transparent outline-none w-full text-body-sm text-on-surface"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label="Limpar busca"
                  className="text-on-surface-variant hover:text-primary">
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              )}
            </label>

            <nav aria-label="Sumário" className="bg-surface-container-low rounded-xl border border-outline-variant p-4">
              <h3 className="text-label-md font-label-md text-primary uppercase tracking-[0.2em] mb-3">Sumário</h3>
              {filtered.length === 0 ? (
                <p className="text-sm text-on-surface-variant">Nenhuma matéria encontrada.</p>
              ) : (
                <ol className="space-y-2">
                  {filtered.map((m: any, idx: number) => (
                    <li key={m.id || idx}>
                      <a href={`#${matterAnchor(m, idx)}`} className="flex justify-between items-baseline gap-2 text-primary hover:underline">
                        <span className="font-semibold text-body-sm uppercase">{m.title}</span>
                        <span className="font-bold text-body-sm">{String(m.position ?? idx + 1).padStart(2, "0")}</span>
                      </a>
                      {m.section_title && <span className="block text-xs text-on-surface-variant">{m.section_title}</span>}
                    </li>
                  ))}
                </ol>
              )}
            </nav>
          </section>

          {/* Matters body */}
          <div className="space-y-14">
            {filtered.map((m: any, idx: number) => (
              <section key={m.id || idx} id={matterAnchor(m, idx)} className="scroll-mt-24 border-t-2 border-surface-container-highest pt-10">
                {m.section_title && (
                  <h3 className="bg-surface-container-low px-6 py-2 inline-block font-bold text-primary border border-outline-variant mb-6 mx-auto text-center uppercase">
                    {m.section_title}
                  </h3>
                )}
                <h4 className="text-center font-bold text-primary text-body-lg uppercase mb-4">{m.title}</h4>
                {m.summary && (
                  <p className="text-body-md font-body-md font-bold text-center uppercase max-w-2xl mx-auto mb-6 leading-relaxed">
                    {m.summary}
                  </p>
                )}
                <div
                  className="prose max-w-none text-on-surface prose-p:my-3 prose-p:text-justify prose-p:text-body-md prose-p:leading-relaxed prose-strong:font-bold prose-headings:text-center prose-headings:uppercase prose-table:w-full prose-th:bg-surface-container-low prose-td:border prose-th:border prose-td:border-outline-variant"
                  dangerouslySetInnerHTML={{ __html: m.content_html || "" }}
                />
                {m.attachments && m.attachments.length > 0 && (
                  <div className="mt-6">
                    <span className="text-label-md text-on-surface-variant uppercase">Anexos</span>
                    <ul className="mt-2 space-y-1">
                      {m.attachments.map((a: any, i: number) => (
                        <li key={i} className="flex items-center gap-2 text-body-sm text-on-surface">
                          <span className="material-symbols-outlined text-sm text-secondary">attach_file</span>
                          {a.title || a.filename || "Anexo"}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            ))}
          </div>

          {/* Footer */}
          <footer className="mt-12 border-t border-outline-variant/50 pt-6 pb-4">
            <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-5 text-body-sm text-on-surface-variant">
              <div className="flex items-center gap-2 mb-3 text-primary font-bold">
                <span className="material-symbols-outlined text-[18px]">verified_user</span>
                <span>Validação do Documento</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {verificationCode && (
                  <div>
                    <span className="text-label-md uppercase opacity-60">Código de verificação</span>
                    <span className="font-mono bg-surface p-1 rounded border border-outline-variant block mt-0.5">{verificationCode}</span>
                  </div>
                )}
                {(authenticity?.signed_pdf_hash || legacy?.pdf_hash) && (
                  <div>
                    <span className="text-label-md uppercase opacity-60">SHA-256 do PDF</span>
                    <span className="font-mono bg-surface p-1 rounded border border-outline-variant text-[11px] break-all block mt-0.5">
                      {authenticity?.signed_pdf_hash || legacy?.pdf_hash}
                    </span>
                  </div>
                )}
              </div>
              <p className="mt-4 text-xs">
                Imprimir é uma <strong>cópia para impressão</strong> — não substitui o PDF oficial assinado digitalmente.
              </p>
            </div>
          </footer>
        </article>
      </div>
    </main>
  );
}

function StatusRow({ label, ok }: { label: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-on-surface-variant">{label}</span>
      <span className="flex items-center gap-1 text-xs font-semibold">
        {ok ? (
          <span className="flex items-center gap-1 text-secondary">
            <span className="material-symbols-outlined text-[16px]">check_circle</span> Sim
          </span>
        ) : (
          <span className="flex items-center gap-1 text-error">
            <span className="material-symbols-outlined text-[16px]">cancel</span> Não
          </span>
        )}
      </span>
    </div>
  );
}
