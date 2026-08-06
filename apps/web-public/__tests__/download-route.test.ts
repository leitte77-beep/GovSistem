import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "../src/app/api/download/[...path]/route";

describe("GET /api/download/[...path]", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards a tenant resolved internally by middleware", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("pdf", {
        status: 200,
        headers: { "content-type": "application/pdf" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest(
      "https://diario.gov.br/api/download/signed_2026_6.pdf?inline=1",
      { headers: { "x-resolved-tenant-slug": "farol" } }
    );

    await GET(request, { params: { path: ["signed_2026_6.pdf"] } });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/public/download/signed_2026_6.pdf?inline=1"),
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Tenant-Slug": "farol" }),
      })
    );
  });

  it("derives the tenant from the public hostname when the cookie is absent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("pdf", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest(
      "https://farol.govsistem.com.br/api/download/signed_2026_6.pdf"
    );

    await GET(request, { params: { path: ["signed_2026_6.pdf"] } });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Tenant-Slug": "farol" }),
      })
    );
  });

  it("prefers the hostname tenant over a stale or malicious cookie", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("pdf", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest(
      "https://farol.govsistem.com.br/api/download/signed_2026_6.pdf",
      { headers: { cookie: "tenant_slug=outro-municipio" } }
    );

    await GET(request, { params: { path: ["signed_2026_6.pdf"] } });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: {
          Host: "farol.govsistem.com.br",
          "X-Tenant-Slug": "farol",
          Origin: "https://farol.govsistem.com.br",
        },
      })
    );
  });

  it("never trusts a tenant cookie", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("pdf", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest(
      "https://diario.govsistem.com.br/api/download/signed_2026_6.pdf",
      { headers: { cookie: "tenant_slug=farol" } }
    );

    await GET(request, { params: { path: ["signed_2026_6.pdf"] } });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: { Host: "diario.govsistem.com.br" },
      })
    );
  });

  it("forwards a custom Host upstream without a tenant header", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("pdf", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest(
      "https://diario.prefeitura.example/api/download/signed.pdf"
    );

    await GET(request, { params: { path: ["signed.pdf"] } });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: { Host: "diario.prefeitura.example" },
      })
    );
  });

  it("forwards the public Host and HTTPS Origin from an internal proxy URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("pdf", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest(
      "http://web-public:3000/api/download/signed.pdf",
      {
        headers: {
          host: "farol.govsistem.com.br",
          "x-forwarded-proto": "https",
          "x-resolved-tenant-slug": "farol",
        },
      }
    );

    await GET(request, { params: { path: ["signed.pdf"] } });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: {
          Host: "farol.govsistem.com.br",
          Origin: "https://farol.govsistem.com.br",
          "X-Tenant-Slug": "farol",
        },
      })
    );
  });

  it.each(["api", "../farol", "Farol!", "a"])(
    "does not forward an unsafe internal tenant: %s",
    async (tenantSlug) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response("pdf", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      const request = new NextRequest(
        "http://localhost/api/download/signed_2026_6.pdf",
        { headers: { "x-resolved-tenant-slug": tenantSlug } }
      );

      await GET(request, { params: { path: ["signed_2026_6.pdf"] } });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ headers: { Host: "localhost" } })
      );
    }
  );

  it.each([
    [".."],
    ["%2e%2e"],
    ["%252e%252e"],
    ["folder\\file.pdf"],
    ["folder%2ffile.pdf"],
    ["file%00.pdf"],
  ])("rejects an unsafe download path segment: %s", async (segment) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const request = new NextRequest("https://farol.govsistem.com.br/api/download/file");
    const response = await GET(request, { params: { path: [segment] } });

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not expose an upstream error detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          { detail: "Tenant obrigatório para armazenamento isolado" },
          { status: 400 }
        )
      )
    );

    const request = new NextRequest(
      "https://farol.govsistem.com.br/api/download/signed_2026_6.pdf"
    );
    const response = await GET(request, {
      params: { path: ["signed_2026_6.pdf"] },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      detail: "Solicitação de arquivo inválida",
    });
  });

  it("maps upstream server errors to a generic 502", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ detail: "internal path /app/uploads/farol" }, { status: 500 })
      )
    );

    const request = new NextRequest(
      "https://farol.govsistem.com.br/api/download/signed_2026_6.pdf"
    );
    const response = await GET(request, {
      params: { path: ["signed_2026_6.pdf"] },
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      detail: "Falha ao obter o arquivo",
    });
  });
});
