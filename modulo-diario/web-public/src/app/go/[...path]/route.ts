import { NextRequest, NextResponse } from "next/server";

/**
 * Public legacy-URL redirect. The backend keeps a tenant-scoped map of old
 * archive URLs to their new canonical paths; this route forwards the request
 * (preserving the host so the tenant is resolved) and issues a permanent 301.
 */
const API_BASE =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:9201/api/v1";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const legacyPath = (path || []).map(encodeURIComponent).join("/");
  const host = request.headers.get("host") || "";

  try {
    const response = await fetch(`${API_BASE}/go/${legacyPath}`, {
      redirect: "manual",
      cache: "no-store",
      headers: host ? { host, "x-forwarded-host": host } : undefined,
    });
    const location = response.headers.get("location");
    if (location) {
      return NextResponse.redirect(new URL(location, request.url), 301);
    }
  } catch {
    // Fall through to the home redirect below.
  }

  return NextResponse.redirect(new URL("/", request.url), 302);
}
