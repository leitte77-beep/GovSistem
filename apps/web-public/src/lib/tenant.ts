export const RESERVED_TENANT_PATHS = new Set([
  "_next",
  "api",
  "favicon.ico",
  "buscar",
  "edicoes",
  "materias",
  "verificar",
  "acervo",
  "sobre",
  "acessibilidade",
  "privacidade",
  "contato",
  "cadastrar",
  "mapa-do-site",
]);

const RESERVED_TENANT_HOSTS = new Set([
  "www",
  "api",
  "admin",
  "doe-admin",
  "diario",
]);

export const INTERNAL_TENANT_HEADER = "x-resolved-tenant-slug";

type RequestUrlLike = {
  host: string;
  hostname: string;
  origin: string;
  protocol: string;
};

export type PublicRequestLocation = RequestUrlLike;

export function resolvePublicRequestLocation(
  fallbackUrl: RequestUrlLike,
  headers: Pick<Headers, "get">
): PublicRequestLocation {
  const forwardedProto = headers
    .get("x-forwarded-proto")
    ?.trim()
    .toLowerCase();
  const protocol =
    forwardedProto === "http" || forwardedProto === "https"
      ? forwardedProto
      : fallbackUrl.protocol.replace(/:$/, "");
  const forwardedHost = headers.get("host")?.trim().toLowerCase();

  if (
    forwardedHost &&
    /^[a-z0-9.-]+(?::\d{1,5})?$/.test(forwardedHost)
  ) {
    try {
      const publicUrl = new URL(`${protocol}://${forwardedHost}`);
      if (
        publicUrl.hostname &&
        !publicUrl.username &&
        !publicUrl.password
      ) {
        return {
          host: publicUrl.host,
          hostname: publicUrl.hostname,
          origin: publicUrl.origin,
          protocol: publicUrl.protocol,
        };
      }
    } catch {
      // Invalid forwarded host/port: use Next's parsed internal URL safely.
    }
  }

  return fallbackUrl;
}

function tenantBaseDomain(): string {
  return (process.env.TENANT_BASE_DOMAIN || "govsistem.com.br")
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, "");
}

function normalizedHostname(hostname: string): string {
  return hostname.toLowerCase().split(":")[0].replace(/\.+$/, "");
}

export function isTenantSlug(value: string): boolean {
  return (
    /^[a-z0-9][a-z0-9-]{1,62}$/.test(value) &&
    !RESERVED_TENANT_PATHS.has(value)
  );
}

export function getTenantFromHostname(hostname: string): string | null {
  const host = normalizedHostname(hostname);
  const baseDomain = tenantBaseDomain();
  const suffix = `.${baseDomain}`;
  if (!baseDomain || !host.endsWith(suffix)) return null;

  const subdomain = host.slice(0, -suffix.length);
  if (!subdomain || RESERVED_TENANT_HOSTS.has(subdomain)) return null;

  return isTenantSlug(subdomain) ? subdomain : null;
}

export function isSharedOfficialHostname(hostname: string): boolean {
  const host = normalizedHostname(hostname);
  const baseDomain = tenantBaseDomain();
  if (!baseDomain) return false;
  if (host === baseDomain) return true;

  const suffix = `.${baseDomain}`;
  if (!host.endsWith(suffix)) return false;

  const subdomain = host.slice(0, -suffix.length);
  return RESERVED_TENANT_HOSTS.has(subdomain);
}
