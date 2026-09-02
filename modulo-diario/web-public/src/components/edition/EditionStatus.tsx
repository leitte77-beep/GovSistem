import type { Authenticity, SnapshotEdition } from "@/lib/edition-types";
import { formatBrasiliaDateTime } from "@/lib/dates";

export type EditionStatusProps = {
  edition: SnapshotEdition;
  authenticity?: Authenticity | null;
  publishedLabel?: string | null;
  /** "card" shows the full status summary; "tech" only the technical disclosure. */
  variant?: "card" | "tech";
};

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
        <EditionStatusRows authenticity={authenticity} labelOverride={stateLine} />
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

        <EditionStatusRows authenticity={authenticity} labelOverride={stateLine} />
      </div>
    </div>
  );
}

function EditionStatusRows({
  authenticity,
  labelOverride,
}: {
  authenticity: Authenticity;
  labelOverride?: string | null;
}) {
  const { states } = authenticity;
  const first = authenticity.signatures?.[0];

  const statusWord =
    states.trusted === true
      ? "válida"
      : states.intact === true
        ? "íntegra (cadeia não verificada)"
        : "verificada";

  const displayLabel = labelOverride || `Validação ${statusWord}`;

  return (
    <details className="group mt-4">
      <summary className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-semibold text-[var(--edition-accent)] transition hover:text-[var(--edition-accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--edition-accent)]">
        <span className="material-symbols-outlined text-[18px] transition-transform group-open:rotate-90">
          chevron_right
        </span>
        Ver detalhes técnicos
      </summary>
      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 border-t border-edition-line pt-4 text-sm sm:grid-cols-2">
        <StatusItem label="Assinatura" value={statusWord} state={states.trusted} />
        <StatusItem label="Arquivo assinado" value={states.signed ? "Sim" : "Não"} state={states.signed} />
        <StatusItem label="Integridade criptográfica" value={states.intact ? "Sim" : "Não"} state={states.intact} />
        <StatusItem label="Certificado na validade" value={threeState(states.certificate_valid)} state={states.certificate_valid} />
        <StatusItem label="Cadeia confiável (ICP-Brasil)" value={threeState(states.chain_trusted)} state={states.chain_trusted} />
        <StatusItem label="Revogação verificada" value={threeState(states.revocation_checked)} state={states.revocation_checked} />
        <StatusItem label="Carimbo de tempo" value={threeState(states.timestamped)} state={states.timestamped} />
        <StatusItem label="Snapshot imutável íntegro" value={threeState(states.snapshot_intact)} state={states.snapshot_intact} />
        <StatusItem label="Situação do snapshot" value={authenticity.snapshot_status || "—"} />

        {first?.subject && (
          <>
            <dt className="col-span-2 border-t border-edition-line pt-2 font-semibold text-edition-ink">
              Signatário (certificado)
            </dt>
            <dd className="col-span-2 text-edition-ink-2">
              {first.subject.split(":").slice(0, 1).join("").replace(/^CN=/, "") || first.subject}
            </dd>
            {first.issuer && (
              <>
                <dt className="font-semibold text-edition-ink">Emissor</dt>
                <dd className="break-words text-edition-ink-2">{first.issuer}</dd>
              </>
            )}
            {first.signature_format && (
              <>
                <dt className="font-semibold text-edition-ink">Formato</dt>
                <dd className="text-edition-ink-2">{first.signature_format}</dd>
              </>
            )}
            {first.signed_at && (
              <>
                <dt className="font-semibold text-edition-ink">Assinado em</dt>
                <dd className="text-edition-ink-2">{formatBrasiliaDateTime(first.signed_at)}</dd>
              </>
            )}
            {first.timestamp && (
              <>
                <dt className="font-semibold text-edition-ink">Carimbo de tempo</dt>
                <dd className="break-words text-edition-ink-2">{first.timestamp}</dd>
              </>
            )}
          </>
        )}

        {authenticity.signed_pdf_hash && (
          <>
            <dt className="col-span-2 border-t border-edition-line pt-2 font-semibold text-edition-ink">
              SHA-256 do PDF assinado
            </dt>
            <dd className="col-span-2 break-all font-mono text-[11px] text-edition-ink-2">
              {authenticity.signed_pdf_hash}
            </dd>
          </>
        )}
        {authenticity.content_manifest_hash && (
          <>
            <dt className="font-semibold text-edition-ink">Manifesto de conteúdo</dt>
            <dd className="break-all font-mono text-[11px] text-edition-ink-2">
              {authenticity.content_manifest_hash}
            </dd>
          </>
        )}
      </dl>
    </details>
  );
}

function threeState(state?: boolean | null): string {
  if (state === true) return "Sim";
  if (state === false) return "Não";
  return "Não verificado";
}

function StatusItem({
  label,
  value,
  state,
}: {
  label: string;
  value: string;
  state?: boolean | null;
}) {
  const icon =
    state === true
      ? { name: "check_circle", cls: "text-[var(--edition-success)]" }
      : state === false
        ? { name: "cancel", cls: "text-[var(--edition-danger)]" }
        : { name: "help", cls: "text-edition-muted" };
  return (
    <>
      <dt className="font-semibold text-edition-ink">{label}</dt>
      <dd className="flex items-center gap-1.5 text-edition-ink-2">
        <span aria-hidden="true" className={`material-symbols-outlined text-[16px] ${icon.cls}`}>
          {icon.name}
        </span>
        {value}
      </dd>
    </>
  );
}

export { VERIFIED_LABELS };
