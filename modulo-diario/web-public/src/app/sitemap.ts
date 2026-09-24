import type { MetadataRoute } from "next";

import { resolveTenantSlug, getRequestOrigin } from "@/lib/server/edition-loader";

type EditionItem = {
  year?: number;
  number?: number;
  edition_number?: number | string;
  verification_code?: string;
};

type EditionsPayload = {
  data?: EditionItem[];
};

type MatterItem = {
  id?: string;
  slug?: string | null;
  edition_number?: number | string;
};

type MattersPayload = {
  data?: MatterItem[];
};

async function fetchPublic<T>(path: string, tenantSlug: string | null): Promise<T> {
  const base = (process.env.API_URL || "http://api:8000/api/v1").replace(/\/api\/v1\/?$/, "");
  const res = await fetch(`${base}${path}`, {
    headers: tenantSlug ? { "X-Tenant-Slug": tenantSlug } : {},
    cache: "no-store",
  });
  if (!res.ok) return {} as T;
  return res.json() as Promise<T>;
}

// Only PUBLISHED editions/matters are exposed (public API returns only those).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const slug = await resolveTenantSlug();
  const origin = await getRequestOrigin();
  const baseUrl = origin || "https://diario.govsistem.com.br";

  const staticRoutes = [
    { path: "", priority: 1.0 },
    { path: "/edicoes", priority: 0.9 },
    { path: "/buscar", priority: 0.8 },
    { path: "/verificar", priority: 0.7 },
    { path: "/acervo", priority: 0.6 },
    { path: "/sobre", priority: 0.5 },
    { path: "/acessibilidade", priority: 0.4 },
    { path: "/privacidade", priority: 0.4 },
    { path: "/contato", priority: 0.4 },
    { path: "/mapa-do-site", priority: 0.3 },
  ];

  const entries: MetadataRoute.Sitemap = staticRoutes.map(({ path, priority }) => ({
    url: `${baseUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority,
  }));

  // Published editions (public API only returns PUBLISHED).
  try {
    const editions = await fetchPublic<EditionsPayload>(
      `/api/public/v1/editions?page_size=100`,
      slug,
    );
    for (const e of editions?.data || []) {
      const year = e.year || 2026;
      const number = e.number ?? e.edition_number;
      if (number == null) continue;
      entries.push({
        url: `${baseUrl}/edicoes/${year}/${number}`,
        lastModified: new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.6,
      });
    }
  } catch {
    // sitemap must not fail the build if the API is momentarily unavailable.
  }

  // Published matters.
  try {
    const matters = await fetchPublic<MattersPayload>(
      `/api/public/v1/matters?page_size=100`,
      slug,
    );
    for (const m of matters?.data || []) {
      const key = (m.slug || "").trim() || m.id;
      if (!key) continue;
      entries.push({
        url: `${baseUrl}/materias/${key}`,
        lastModified: new Date(),
        changeFrequency: "monthly" as const,
        priority: 0.5,
      });
    }
  } catch {
    // ignore
  }

  return entries;
}
