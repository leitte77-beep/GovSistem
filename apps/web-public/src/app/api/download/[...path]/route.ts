import { NextRequest, NextResponse } from "next/server";
import {
  getTenantFromHostname,
  INTERNAL_TENANT_HEADER,
  isTenantSlug,
  resolvePublicRequestLocation,
} from "@/lib/tenant";

const API_BASE =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "/api/v1";

function isUnsafePathSegment(segment: string): boolean {
  let current = segment;

  for (let depth = 0; depth < 5; depth += 1) {
    if (
      !current ||
      current === "." ||
      current === ".." ||
      current.includes("/") ||
      current.includes("\\") ||
      current.includes("\0")
    ) {
      return true;
    }

    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      return true;
    }

    if (decoded === current) return false;
    current = decoded;
  }

  // Reject deliberately over-encoded input instead of guessing its final form.
  return true;
}

function upstreamError(status: number) {
  if (status >= 500) {
    return NextResponse.json(
      { detail: "Falha ao obter o arquivo" },
      { status: 502 }
    );
  }

  const detail =
    status === 404
      ? "Arquivo não encontrado"
      : status === 400
        ? "Solicitação de arquivo inválida"
        : status === 401 || status === 403
          ? "Acesso ao arquivo negado"
          : "Não foi possível obter o arquivo";

  return NextResponse.json({ detail }, { status });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  if (!params.path.length || params.path.some(isUnsafePathSegment)) {
    return NextResponse.json(
      { detail: "Solicitação de arquivo inválida" },
      { status: 400 }
    );
  }

  const filePath = params.path.map(encodeURIComponent).join("/");
  const publicLocation = resolvePublicRequestLocation(
    request.nextUrl,
    request.headers
  );
  const hostnameTenant = getTenantFromHostname(publicLocation.hostname);
  const internalTenant = request.headers
    .get(INTERNAL_TENANT_HEADER)
    ?.trim()
    .toLowerCase();
  const tenantSlug =
    hostnameTenant ||
    (internalTenant && isTenantSlug(internalTenant) ? internalTenant : null);
  const upstreamHeaders: Record<string, string> = {};

  if (tenantSlug) {
    upstreamHeaders["X-Tenant-Slug"] = tenantSlug;

    // This lets the API reject a mismatched tenant header on subdomain portals.
    if (hostnameTenant === tenantSlug) {
      upstreamHeaders.Origin = publicLocation.origin;
    }
  }
  upstreamHeaders.Host = publicLocation.host;

  const upstreamPrefix = new URL(
    `${API_BASE.replace(/\/$/, "")}/public/download/`,
    request.nextUrl.origin
  );
  const upstreamUrl = new URL(filePath, upstreamPrefix);
  upstreamUrl.search = request.nextUrl.search;

  if (
    upstreamUrl.origin !== upstreamPrefix.origin ||
    !upstreamUrl.pathname.startsWith(upstreamPrefix.pathname)
  ) {
    return NextResponse.json(
      { detail: "Solicitação de arquivo inválida" },
      { status: 400 }
    );
  }

  let response: Response;
  try {
    response = await fetch(upstreamUrl.toString(), {
      cache: "no-store",
      headers: upstreamHeaders,
    });
  } catch {
    return upstreamError(502);
  }

  if (!response.ok) {
    return upstreamError(response.status);
  }

  const headers = new Headers();
  const contentType = response.headers.get("content-type");
  const disposition = response.headers.get("content-disposition");
  const contentLength = response.headers.get("content-length");
  const signedHash = response.headers.get("x-sha256-signed");

  if (contentType) headers.set("content-type", contentType);
  if (disposition) headers.set("content-disposition", disposition);
  if (contentLength) headers.set("content-length", contentLength);
  if (signedHash) headers.set("x-sha256-signed", signedHash);

  return new NextResponse(response.body, { status: response.status, headers });
}
