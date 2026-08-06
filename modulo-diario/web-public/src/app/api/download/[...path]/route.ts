import { NextRequest, NextResponse } from "next/server";

const API_BASE =
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:9201/api/v1";

export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const filePath = params.path.map(encodeURIComponent).join("/");
  const query = request.nextUrl.searchParams.toString();
  const response = await fetch(`${API_BASE}/public/download/${filePath}${query ? `?${query}` : ""}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    return NextResponse.json(
      { detail: "Arquivo não encontrado" },
      { status: response.status }
    );
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

  return new NextResponse(response.body, { headers });
}
