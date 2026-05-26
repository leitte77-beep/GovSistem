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

function isTenantSlug(value: string) {
  return /^[a-z0-9][a-z0-9-]{1,62}$/.test(value) && !RESERVED.has(value);
}

function tenantSlugFromHost(host: string) {
  const hostname = host.split(":")[0].toLowerCase();
  const suffix = ".govsistem.com.br";
  if (!hostname.endsWith(suffix)) return null;
  const subdomain = hostname.slice(0, -suffix.length);
  if (!subdomain || subdomain.includes(".")) return null;
  return isTenantSlug(subdomain) ? subdomain : null;
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const parts = pathname.split("/").filter(Boolean);
  const first = parts[0];
  const hostTenantSlug = tenantSlugFromHost(request.headers.get("host") || "");

  if (hostTenantSlug) {
    const response = NextResponse.next();
    response.cookies.set("tenant_slug", hostTenantSlug, {
      path: "/",
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
    });
    response.headers.set("x-tenant-slug", hostTenantSlug);
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
