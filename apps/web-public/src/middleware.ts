import { NextRequest, NextResponse } from "next/server";

const RESERVED = new Set([
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

const RESERVED_HOSTS = new Set(["www", "api", "admin", "doe-admin", "diario"]);

function isTenantSlug(value: string) {
  return /^[a-z0-9][a-z0-9-]{1,62}$/.test(value) && !RESERVED.has(value);
}

function getTenantFromHostname(hostname: string) {
  const host = hostname.toLowerCase();
  const parts = host.split(".");
  if (parts.length < 3) return null;
  const subdomain = parts[0];
  if (!subdomain || RESERVED_HOSTS.has(subdomain)) return null;
  return isTenantSlug(subdomain) ? subdomain : null;
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const parts = pathname.split("/").filter(Boolean);
  const first = parts[0];
  const hostnameTenant = getTenantFromHostname(request.nextUrl.hostname);

  if (hostnameTenant) {
    const response = NextResponse.next();
    response.cookies.set("tenant_slug", hostnameTenant, {
      path: "/",
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
    });
    response.headers.set("x-tenant-slug", hostnameTenant);
    return response;
  }

  if (first && isTenantSlug(first)) {
    const rewritePath = `/${parts.slice(1).join("/")}`;
    const url = request.nextUrl.clone();
    url.pathname = rewritePath === "/" ? "/" : rewritePath;
    const response = NextResponse.rewrite(url);
    response.cookies.set("tenant_slug", first, {
      path: "/",
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
    });
    response.headers.set("x-tenant-slug", first);
    return response;
  }

  const tenantSlug = request.cookies.get("tenant_slug")?.value;
  if (
    tenantSlug &&
    isTenantSlug(tenantSlug) &&
    first &&
    RESERVED.has(first) &&
    first !== "_next" &&
    first !== "api"
  ) {
    const url = request.nextUrl.clone();
    url.pathname = `/${tenantSlug}${pathname}`;
    url.search = search;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
