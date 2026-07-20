import { NextRequest, NextResponse } from "next/server";
import {
  getTenantFromHostname,
  INTERNAL_TENANT_HEADER,
  isSharedOfficialHostname,
  isTenantSlug,
  RESERVED_TENANT_PATHS,
  resolvePublicRequestLocation,
} from "@/lib/tenant";

function resolvedRequestHeaders(request: NextRequest, tenantSlug?: string) {
  const headers = new Headers(request.headers);
  headers.delete(INTERNAL_TENANT_HEADER);
  if (tenantSlug) headers.set(INTERNAL_TENANT_HEADER, tenantSlug);
  return headers;
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const parts = pathname.split("/").filter(Boolean);
  const first = parts[0];
  const publicLocation = resolvePublicRequestLocation(
    request.nextUrl,
    request.headers
  );
  const hostnameTenant = getTenantFromHostname(publicLocation.hostname);
  const sharedOfficialHost = isSharedOfficialHostname(publicLocation.hostname);
  const pathTenant = first && isTenantSlug(first) ? first : null;

  if (
    pathTenant &&
    (pathTenant === hostnameTenant || sharedOfficialHost)
  ) {
    const rewritePath = `/${parts.slice(1).join("/")}`;
    const url = request.nextUrl.clone();
    url.pathname = rewritePath === "/" ? "/" : rewritePath;
    const response = NextResponse.rewrite(url, {
      request: { headers: resolvedRequestHeaders(request, pathTenant) },
    });
    response.cookies.set("tenant_slug", pathTenant, {
      path: "/",
      sameSite: "lax",
      secure: publicLocation.protocol === "https:",
    });
    response.headers.set("x-tenant-slug", pathTenant);
    return response;
  }

  if (hostnameTenant) {
    const response = NextResponse.next({
      request: { headers: resolvedRequestHeaders(request, hostnameTenant) },
    });
    response.cookies.set("tenant_slug", hostnameTenant, {
      path: "/",
      sameSite: "lax",
      secure: publicLocation.protocol === "https:",
    });
    response.headers.set("x-tenant-slug", hostnameTenant);
    return response;
  }

  const cookieTenant = request.cookies.get("tenant_slug")?.value;
  if (
    cookieTenant &&
    sharedOfficialHost &&
    isTenantSlug(cookieTenant) &&
    first &&
    RESERVED_TENANT_PATHS.has(first) &&
    first !== "_next" &&
    first !== "api"
  ) {
    const url = new URL(`/${cookieTenant}${pathname}${search}`, publicLocation.origin);
    return NextResponse.redirect(url);
  }

  return NextResponse.next({
    request: { headers: resolvedRequestHeaders(request) },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
