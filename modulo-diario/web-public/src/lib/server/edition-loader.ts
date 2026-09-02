import { headers } from "next/headers";
import { cache } from "react";
import type {
  EditionSnapshotPayload,
  LegacyEditionPayload,
  OrganizationInfoServer,
} from "@/lib/edition-types";

// Tenant resolution mirrors src/middleware.ts so SSR reaches the right tenant
// without depending on a client round-trip or the x-tenant-slug header.
function tenantSlugFromHost(host: string | null): string | null {
  if (!host) return null;
  const hostname = host.split(":")[0].toLowerCase();
  const suffix = ".govsistem.com.br";
  if (!hostname.endsWith(suffix)) return null;
  const subdomain = hostname.slice(0, -suffix.length);
  if (!subdomain || subdomain.includes(".")) return null;
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(subdomain)) return null;
  return subdomain;
}

function apiBase(): string {
  // Same env contract used by next.config.js rewrites.
  return (process.env.API_URL || "http://api:8000/api/v1").replace(/\/api\/v1\/?$/, "");
}

export async function resolveTenantSlug(): Promise<string | null> {
  const h = await headers();
  const host = h.get("host");
  const slug = tenantSlugFromHost(host);
  if (slug) return slug;
  const cookieHeader = h.get("cookie");
  const match = cookieHeader?.match(/(?:^|;\s*)tenant_slug=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Absolute origin for the current request (used for canonical/OG links). */
export async function getRequestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host") || "localhost";
  const fwdProto = h.get("x-forwarded-proto");
  const secure = fwdProto === "https" || host.endsWith(".govsistem.com.br");
  return `${secure ? "https" : fwdProto === "http" ? "http" : "http"}://${host}`;
}

async function fetchPublic<T>(path: string, tenantSlug: string | null): Promise<T> {
  const base = apiBase();
  const res = await fetch(`${base}${path}`, {
    headers: tenantSlug ? { "X-Tenant-Slug": tenantSlug } : {},
    cache: "no-store",
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    (err as any).status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

async function loadEditionSnapshot(year: number, number: number): Promise<EditionSnapshotPayload> {
  const slug = await resolveTenantSlug();
  return fetchPublic<EditionSnapshotPayload>(
    `/api/public/v1/editions/${year}/${number}/snapshot`,
    slug,
  );
}

async function loadLegacyEdition(year: number, number: number): Promise<LegacyEditionPayload> {
  const slug = await resolveTenantSlug();
  return fetchPublic<LegacyEditionPayload>(`/api/public/v1/editions/by-year/${year}/${number}`, slug);
}

export const getEditionPage = cache(async function getEditionPage(year: number, number: number) {
  try {
    const payload = await loadEditionSnapshot(year, number);
    return {
      kind: "snapshot" as const,
      snapshotHasContent: payload.snapshot.has_snapshot,
      payload,
    };
  } catch (e) {
    // Legacy editions (pre-semantic engine) have no snapshot route content.
    // Fall back to the by-year route that still serves published legacy items.
    const legacy = await loadLegacyEdition(year, number);
    return { kind: "legacy" as const, snapshotHasContent: false, payload: legacy };
  }
});

export const getOrganizationServer = cache(async function getOrganizationServer() {
  const slug = await resolveTenantSlug();
  return fetchPublic<OrganizationInfoServer>("/api/public/v1/organization", slug);
});

export type PublicMatterPayload = {
  id: string;
  title: string;
  summary: string | null;
  content_html: string;
  act_type: string;
  org_unit: string;
  author: string;
  published_at: string | null;
  attachments: Array<{
    id: string;
    title: string;
    type: string;
    file: { filename: string; mime_type: string; size_bytes: number } | null;
  }>;
  edition: {
    id: string;
    number: number;
    year: number;
    title: string;
    publication_date: string | null;
    verification_code: string | null;
    pdf_hash: string | null;
    immutability_hash: string | null;
  } | null;
  signature: {
    signed_at: string | null;
    certificate_label: string;
    certificate_subject: string;
    certificate_serial: string;
    certificate_thumbprint: string;
  } | null;
};

export const getMatterPage = cache(async function getMatterPage(id: string) {
  const slug = await resolveTenantSlug();
  return fetchPublic<PublicMatterPayload>(`/api/public/v1/matters/${id}`, slug);
});

export type VerificationPayload = {
  found: boolean;
  kind: "edition" | null;
  valid: boolean;
  message: string;
  schema_version: number;
  document: {
    type: string;
    edition: {
      year: number;
      number: number;
      type: string;
      title: string;
      publication_date: string | null;
      published_at: string | null;
      verification_code: string | null;
      publication_status: string;
    };
    publisher: { name: string; slug: string; logo_url: string | null; description: string | null } | null;
    publication: { situation: string; has_snapshot: boolean; snapshot_frozen_at: string | null };
    authenticity: {
      signed: boolean;
      trusted: boolean;
      intact: boolean;
      signed_pdf_hash: string | null;
      content_manifest_hash: string | null;
      signatures: Array<{
        signed_at: string | null;
        subject: string;
        issuer: string;
        valid_from: string | null;
        valid_to: string | null;
        signature_format: string | null;
        timestamp: string | null;
      }>;
    };
    integrity: {
      signed_pdf_hash: string | null;
      content_manifest_hash: string | null;
      immutability_hash: string | null;
    };
    links: { verify: string | null; edition: string; download: string };
  } | null;
  matters: Array<{
    id: string;
    title: string;
    summary: string | null;
    act_number: string | null;
    act_year: number | null;
    section: string | null;
    publication_type: string | null;
    legal_status: Record<string, unknown> | null;
  }>;
  matter: unknown | null;
};

export const getVerificationServer = cache(async function getVerificationServer(code: string) {
  const slug = await resolveTenantSlug();
  const clean = code.trim().toUpperCase();
  return fetchPublic<VerificationPayload>(`/api/public/v1/verification/${encodeURIComponent(clean)}`, slug);
});

/**
 * Fetch the published editions of a given year to derive real prev/next
 * neighbours (never assumes a contiguous numeric sequence).
 */
export const getSiblingEditions = cache(async function getSiblingEditions(year: number, number: number) {
  const slug = await resolveTenantSlug();
  let list: Array<{ year: number; number: number }> = [];
  try {
    const raw = await fetchPublic<Array<{ year: number; number: number }> | { data: Array<{ year: number; number: number }> }>(
      `/api/public/v1/editions?year=${year}&page_size=100`,
      slug,
    );
    list = Array.isArray(raw) ? raw : raw?.data || [];
  } catch {
    list = [];
  }
  const others = list.filter((e) => e.number !== number);
  const prevEdition = others.filter((e) => e.number < number).sort((a, b) => b.number - a.number)[0] || null;
  const nextEdition = others.filter((e) => e.number > number).sort((a, b) => a.number - b.number)[0] || null;
  return { prevEdition, nextEdition };
});
