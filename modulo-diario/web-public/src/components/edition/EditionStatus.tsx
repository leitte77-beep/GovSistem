import type { Authenticity, SnapshotEdition } from "@/lib/edition-types";
import { formatBrasiliaDateTime } from "@/lib/dates";

export type EditionStatusProps = {
  edition: SnapshotEdition;
  authenticity?: Authenticity | null;
  publishedLabel?: string | null;
};

const VERIFIED_LABELS: Record<string, string> = {
  valid: "Assinatura válida e confiável",
  ok: "Assinatura válida e confiável",
  invalid: "Assinatura não confiável",
  error: "Falha de validação",
};

export default function EditionStatus({ edition, authenticity, publishedLabel }: EditionStatusProps) {
  if (!authenticity) return null;

  const trusted = Boolean(authenticity.states.trusted);
  const intact = Boolean(authenticity.states.intact);
  const signed = Boolean(authenticity.states.signed);

  const title = trusted
    ? "Publicação oficial"
    : intact
      ? "Publicação com integridade verificada"
      : "Publicação verificada";  const subtitle =
    publishedLabel ||
    (edition.publication_date
      ? `Publicação oficial do dia ${formatBrasiliaDateTime(edition.publication_date)}`
      : "Publicação oficial");

  const stateLine = trusted
    ? "Assinada digitalmente com certificado confiável."
    : signed
      ? "Assinada digitalmente."
      : null;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
      <span
        aria-hidden="true"
        className={`mt-0.5 material-symbols-outlined ${trusted || intact ? "text-secondary" : "text-on-surface-variant"}`}
      >
        {trusted || intact ? "verified_user" : "lock"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body-sm font-bold text-on-surface">{title}</p>
        <p className="text-body-sm text-on-surface-variant">{subtitle}</p>
        {stateLine && <p className="text-body-sm text-on-surface-variant">{stateLine}</p>}

        {authenticity.validation_checked_at && (
          <p className="text-xs text-on-surface-variant mt-0.5">
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
    <details className="mt-3 group">
      <summary className="inline-flex cursor-pointer items-center gap-1.5 text-label-md font-bold text-primary hover:underline">
        <span className="material-symbols-outlined text-[18px] transition-transform group-open:rotate-180">
          expand_more
        </span>
        Ver detalhes técnicos
      </summary>
      <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-body-sm border-t border-outline-variant pt-3">
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
            <dt className="font-semibold text-on-surface col-span-2 border-t border-outline-variant pt-2">
              Signatário (certificado)
            </dt>
            <dd className="col-span-2 text-on-surface-variant">
              {first.subject.split(":").slice(0, 1).join("").replace(/^CN=/, "") || first.subject}
            </dd>
            {first.issuer && (
              <>
                <dt className="font-semibold text-on-surface">Emissor</dt>
                <dd className="text-on-surface-variant break-words">{first.issuer}</dd>
              </>
            )}
            {first.signature_format && (
              <>
                <dt className="font-semibold text-on-surface">Formato</dt>
                <dd className="text-on-surface-variant">{first.signature_format}</dd>
              </>
            )}
            {first.signed_at && (
              <>
                <dt className="font-semibold text-on-surface">Assinado em</dt>
                <dd className="text-on-surface-variant">{formatBrasiliaDateTime(first.signed_at)}</dd>
              </>
            )}
            {first.timestamp && (
              <>
                <dt className="font-semibold text-on-surface">Carimbo de tempo</dt>
                <dd className="text-on-surface-variant break-words">{first.timestamp}</dd>
              </>
            )}
          </>
        )}

        {authenticity.signed_pdf_hash && (
          <>
            <dt className="font-semibold text-on-surface col-span-2 border-t border-outline-variant pt-2">
              SHA-256 do PDF assinado
            </dt>
            <dd className="col-span-2 font-mono text-[11px] break-all text-on-surface-variant">
              {authenticity.signed_pdf_hash}
            </dd>
          </>
        )}
        {authenticity.content_manifest_hash && (
          <>
            <dt className="font-semibold text-on-surface">Manifesto de conteúdo</dt>
            <dd className="font-mono text-[11px] break-all text-on-surface-variant">
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
      ? { name: "check_circle", cls: "text-secondary" }
      : state === false
        ? { name: "cancel", cls: "text-error" }
        : { name: "help", cls: "text-on-surface-variant" };
  return (
    <>
      <dt className="font-semibold text-on-surface">{label}</dt>
      <dd className="text-on-surface-variant flex items-center gap-1.5">
        <span aria-hidden="true" className={`material-symbols-outlined text-[16px] ${icon.cls}`}>
          {icon.name}
        </span>
        {value}
      </dd>
    </>
  );
}

export { VERIFIED_LABELS };
