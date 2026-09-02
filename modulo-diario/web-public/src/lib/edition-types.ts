// Shared, runtime-safe types for the public edition & matter pages.
// No Node/server-only imports here so it can be imported from both
// Server Components and Client Components.

export interface SnapshotSignature {
  signed_at: string | null;
  subject: string;
  serial: string;
  serial_masked: string;
  issuer: string;
  valid_from: string;
  valid_to: string;
  signature_format: string;
  validation_status: string;
  sha256_signed: string;
  verified_at?: string | null;
  timestamp?: string | null;
  verification_code: string;
}

export interface AuthenticityStates {
  signed: boolean;
  intact: boolean;
  trusted: boolean;
  certificate_valid?: boolean | null;
  chain_trusted?: boolean | null;
  revocation_checked?: boolean | null;
  timestamped?: boolean | null;
  snapshot_intact?: boolean | null;
}

export interface Authenticity {
  verification_code: string;
  signed_pdf_hash: string | null;
  content_manifest_hash: string | null;
  snapshot_intact: boolean;
  snapshot_status?: string;
  validation_checked_at?: string | null;
  signatures: SnapshotSignature[];
  states: AuthenticityStates;
}

export interface PublicationArtifact {
  id: string;
  artifact_type: string;
  storage_path: string;
  sha256: string;
  size_bytes: number | null;
  mime_type: string | null;
  validation_status: string | null;
  is_preview: boolean;
}

export interface SnapshotEdition {
  id: string;
  number: number;
  year: number;
  type: string;
  title: string;
  subtitle: string | null;
  publication_date: string | null;
  verification_code: string;
  organization: string;
  slug: string;
}

export interface SnapshotMatter {
  id: string | null;
  position: number | null;
  section_title: string | null;
  title: string;
  summary: string | null;
  content_html: string;
  attachments: Array<{
    id?: string;
    title?: string;
    filename?: string;
    type?: string;
    size_bytes?: number;
  }>;
  semantic_hash?: string | null;
}

export interface EditionSnapshotPayload {
  edition: SnapshotEdition;
  snapshot: {
    content_manifest_hash: string | null;
    frozen_at: string | null;
    has_snapshot: boolean;
  };
  authenticity: Authenticity;
  artifacts: PublicationArtifact[];
  matters: SnapshotMatter[];
  total_matters: number;
}

/** Public subset used by client-side controls (no HTML content). */
export interface MatterMeta {
  id: string;
  anchorId: string;
  position: number;
  title: string;
  summary: string | null;
  section: string | null;
}

export interface OrganizationInfoServer {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  description: string | null;
  contact_email: string | null;
  address: string | null;
  theme: {
    primary_color: string;
    secondary_color: string;
    font_family: string;
  };
}

/** Legacy edition payload (no semantic snapshot) fetched from /by-year. */
export interface LegacyEditionPayload {
  id: string;
  number: number;
  year: number;
  type: string;
  title: string;
  subtitle: string | null;
  publication_date: string | null;
  pdf_path: string | null;
  pdf_url: string | null;
  pdf_hash: string | null;
  verification_code: string | null;
  immutability_hash: string | null;
  published_at: string | null;
  page_count: number | null;
  items: Array<{
    id: string;
    position: number;
    section_title: string | null;
    page_number: number | null;
    matter: {
      id: string | null;
      title: string;
      summary: string | null;
      content_html: string;
      act_type: string;
      org_unit: string;
    } | null;
  }>;
  signatures: Array<{
    signed_at: string | null;
    certificate_info: Record<string, unknown>;
    verification_code: string | null;
  }>;
}
