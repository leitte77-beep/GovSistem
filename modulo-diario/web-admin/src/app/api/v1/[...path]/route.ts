import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL || "http://api:8000/api/v1";

async function proxy(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const target = new URL(`${API_URL}/${params.path.join("/")}`);
  request.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.append(key, value);
  });

  const headers = new Headers(request.headers);
  headers.delete("host");

  const method = request.method;
  const hasBody = !["GET", "HEAD"].includes(method);
  const response = await fetch(target, {
    method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    cache: "no-store",
  });

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");

  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
