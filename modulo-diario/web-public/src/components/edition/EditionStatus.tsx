import type { Authenticity, SnapshotEdition } from "@/lib/edition-types";
import { formatBrasiliaDateTime } from "@/lib/dates";

export type EditionStatusProps = {
  edition: SnapshotEdition;
  authenticity?: Authenticity | null;
  publishedLabel?: string | null;
  /** "card" shows the full status summary; "tech" only the technical rows. */
  variant?: "card" | "tech";
};

/** 3-state tone model: ok / warn / neutral — false is never auto-"critical". */
type Tone = "ok" | "warn" | "neutral";

const VERIFIED_LABELS: Record<string, string> = {
  valid: "Assinatura válida e confiável",
  ok: "Assinatura válida e confiável",
  invalid: "Assinatura não confiável",
  error: "Falha de validação",
};

export default function EditionStatus({
  edition,
  authenticity,
  publishedLabel,
  variant = "card",
}: EditionStatusProps) {
  if (!authenticity) return null;

  const trusted = Boolean(authenticity.states.trusted);
  const intact = Boolean(authenticity.states.intact);
  const signed = Boolean(authenticity.states.signed);

  const title = trusted
    ? "Publicação oficial"
    : intact
      ? "Publicação com integridade verificada"
      : "Publicação verificada";
  const subtitle =
    publishedLabel ||
    (edition.publication_date
      ? `Publicação oficial do dia ${formatBrasiliaDateTime(edition.publication_date)}`
      : "Publicação oficial");

  const stateLine = trusted
    ? "Assinada digitalmente com certificado confiável."
    : signed
      ? "Assinada digitalmente."
      : null;

  if (variant === "tech") {
    return (
      <div className="mt-9 border-t border-edition-line pt-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-edition-muted">
          Autenticidade técnica
        </p>
        <AuthenticityRows authenticity={authenticity} labelOverride={stateLine} />
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-edition-line bg-edition-sheet p-5">
      <span
        aria-hidden="true"
        className={`material-symbols-outlined mt-0.5 ${trusted || intact ? "text-[var(--edition-success)]" : "text-edition-muted"}`}
      >
        {trusted || intact ? "verified_user" : "lock"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-edition-ink">{title}</p>
        <p className="text-sm text-edition-ink-2">{subtitle}</p>
        {stateLine && <p className="text-sm text-edition-ink-2">{stateLine}</p>}
        {authenticity.validation_checked_at && (
          <p className="mt-0.5 text-xs text-edition-muted">
            Última validação: {formatBrasiliaDateTime(authenticity.validation_checked_at)}
          </p>
        )}
        <AuthenticityRows authenticity={authenticity} labelOverride={stateLine} />
      </div>
    </div>
  );
}

/** A tri-state value: true / false / null (not tested). */
type Tri = boolean | null | undefined;

function vTrue(a: Tri): boolean {
  return a === true;
}

/**
 * Human-facing technical rows. Every field keeps its true meaning; `false`
 * is rendered with a neutral/warn tone and wording that never reads as a
 * hard "error" for values that are simply absent or self-issued.
 */
export function AuthenticityRows({
  authenticity,
  opened = false,
}: {
  authenticity: Authenticity;
  labelOverride?: string | null;
  opened?: boolean;
}) {
  const { states } = authenticity;
  const first = authenticity.signatures?.[0];

  const rows = [
    row("signed", "Assinatura digital", "Assinada", "Não assinada", "Não verificado", "ok", "neutral"),
    row("certificate_valid", "Validade do certificado", "Válido", "Fora da validade", "Não verificado", "ok", "warn"),
    row("chain_trusted", "Cadeia de certificação (ICP-Brasil)", "Ancorada (ICP-Brasil)", "Certificado próprio, não ancorado", "Não verificado", "ok", "neutral"),
    row("revocation_checked", "Consulta de revogação", "Consultada", "Não consultada", "Não verificado", "ok", "neutral"),
    row("timestamped", "Carimbo de tempo", "Presente", "Ausente", "Não verificado", "ok", "neutral"),
    row("snapshot_intact", "Integridade do conteúdo (snapshot)", "Íntegro", "Divergência detectada", "Não verificado", "ok", "warn"),
    row("intact", "Integridade do documento assinado", "Íntegro", "Não atestada", "Não verificado", "ok", "neutral"),
  ].map((def) => stateRow(def, states));

  function row(
    key: keyof typeof states,
    label: string,
    t: string,
    f: string,
    n: string,
    toneT: Tone,
    toneF: Tone,
  ) {
    return { key, label, t, f, n, toneT, toneF };
  }
  function stateRow(
    def: ReturnType<typeof row>,
    s: typeof states,
  ) {
    const val = s[def.key];
    const tone: Tone = val === true ? def.toneT : val === false ? def.toneF : "neutral";
    const text = val === true ? def.t : val === false ? def.f : def.n;
    return { label: def.label, text, tone };
  }

  return (
    <details className="group mt-4" open={opened}>
      <summary className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-[var(--edition-accent)] transition hover:text-[var(--edition-accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--edition-accent)]">
        <span className="material-symbols-outlined text-[18px] transition-transform group-open:rotate-90">
          chevron_right
        </span>
        Ver detalhes técnicos
      </summary>
      <div className="mt-4 border-t border-edition-line pt-4">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {rows.map((r) => (
            <RowLine key={r.label} label={r.label} text={r.text} tone={r.tone} />
          ))}
          <RowLine label="Situação do snapshot" text={authenticity.snapshot_status || "—"} tone="neutral" />
        </dl>

        {first?.subject && (
          <div className="mt-5 border-t border-edition-line pt-4">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-edition-muted">
              Signatário
            </p>
            <p className="text-sm font-semibold text-edition-ink">
              {first.subject.split(":").slice(0, 1).join("").replace(/^CN=/, "") || first.subject}
            </p>
            {first.issuer && <p className="mt-0.5 break-words text-[13px] text-edition-muted">Emissor: {first.issuer}</p>}
            {first.signature_format && (
              <p className="mt-0.5 text-[13px] text-edition-muted">Formato: {first.signature_format}</p>
            )}
            {first.signed_at && (
              <p className="mt-0.5 text-[13px] text-edition-muted">Assinado em: {formatBrasiliaDateTime(first.signed_at)}</p>
            )}
            {first.timestamp && (
              <p className="mt-0.5 text-[13px] text-edition-muted">Carimbo de tempo: {first.timestamp}</p>
            )}
          </div>
        )}

        {authenticity.signed_pdf_hash && (
          <div className="mt-5 border-t border-edition-line pt-4">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-edition-muted">SHA-256 do PDF assinado</p>
            <p className="break-all font-mono text-[11px] leading-relaxed text-edition-ink-2">
              {authenticity.signed_pdf_hash}
            </p>
          </div>
        )}
        {authenticity.content_manifest_hash && (
          <div className="mt-4">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-edition-muted">Manifesto de conteúdo</p>
            <p className="break-all font-mono text-[11px] leading-relaxed text-edition-ink-2">
              {authenticity.content_manifest_hash}
            </p>
          </div>
        )}
      </div>
    </details>
  );
}

function RowLine({ label, text, tone }: { label: string; text: string; tone: Tone }) {
  const cls =
    tone === "ok"
      ? "text-[var(--edition-success)]"
      : tone === "warn"
        ? "text-[var(--edition-warn)]"
        : "text-edition-muted";
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-edition-line/50 py-1.5">
      <dt className="text-edition-ink-2">{label}</dt>
      <dd className={`flex items-center gap-1.5 text-right text-[13px] ${cls}`}>
        {tone === "ok" ? (
          <span aria-hidden="true" className="material-symbols-outlined text-[15px]">check_circle</span>
        ) : tone === "warn" ? (
          <span aria-hidden="true" className="material-symbols-outlined text-[15px]">error_outline</span>
        ) : null}
        {text}
      </dd>
    </div>
  );
}

export { VERIFIED_LABELS };
