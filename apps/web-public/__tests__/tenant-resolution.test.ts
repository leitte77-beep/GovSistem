import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { middleware } from "../src/middleware";
import { getTenantFromHostname } from "../src/lib/tenant";

const INTERNAL_TENANT_HEADER = "x-resolved-tenant-slug";

describe("tenant resolution", () => {
  it("accepts a tenant only under the trusted base domain", () => {
    expect(getTenantFromHostname("farol.govsistem.com.br")).toBe("farol");
    expect(getTenantFromHostname("farol.attacker.example")).toBeNull();
  });

  it("overwrites a client supplied internal header with the hostname tenant", () => {
    const response = middleware(
      new NextRequest("https://farol.govsistem.com.br/api/download/file.pdf", {
        headers: { [INTERNAL_TENANT_HEADER]: "outro-municipio" },
      })
    );

    expect(
      response.headers.get(`x-middleware-request-${INTERNAL_TENANT_HEADER}`)
    ).toBe("farol");
  });

  it("sets the internal tenant header when rewriting path mode", () => {
    const response = middleware(
      new NextRequest("https://diario.govsistem.com.br/farol/edicoes")
    );

    expect(
      response.headers.get(`x-middleware-request-${INTERNAL_TENANT_HEADER}`)
    ).toBe("farol");
  });

  it("rewrites a matching tenant prefix on its trusted subdomain", () => {
    const response = middleware(
      new NextRequest(
        "https://farol.govsistem.com.br/farol/api/download/file.pdf"
      )
    );

    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://farol.govsistem.com.br/api/download/file.pdf"
    );
    expect(
      response.headers.get(`x-middleware-request-${INTERNAL_TENANT_HEADER}`)
    ).toBe("farol");
  });

  it("resolves the public tenant when Next receives an internal proxy URL", () => {
    const response = middleware(
      new NextRequest(
        "http://web-public:3000/farol/api/download/signed.pdf",
        {
          headers: {
            host: "farol.govsistem.com.br",
            "x-forwarded-proto": "https",
          },
        }
      )
    );

    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "http://web-public:3000/api/download/signed.pdf"
    );
    expect(
      response.headers.get(`x-middleware-request-${INTERNAL_TENANT_HEADER}`)
    ).toBe("farol");
  });

  it("does not let another path tenant replace the trusted hostname tenant", () => {
    const response = middleware(
      new NextRequest(
        "https://farol.govsistem.com.br/outro/api/download/file.pdf"
      )
    );

    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(
      response.headers.get(`x-middleware-request-${INTERNAL_TENANT_HEADER}`)
    ).toBe("farol");
  });

  it("does not use a path tenant on a custom domain", () => {
    const response = middleware(
      new NextRequest(
        "https://diario.prefeitura.example/outro/api/download/file.pdf"
      )
    );

    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(
      response.headers.get(`x-middleware-request-${INTERNAL_TENANT_HEADER}`)
    ).toBeNull();
  });

  it("does not use a tenant cookie to redirect on a custom domain", () => {
    const response = middleware(
      new NextRequest("https://diario.prefeitura.example/edicoes", {
        headers: { cookie: "tenant_slug=outro" },
      })
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("keeps the tenant cookie only as a UI redirect to a canonical path", () => {
    const response = middleware(
      new NextRequest("https://diario.govsistem.com.br/edicoes", {
        headers: { cookie: "tenant_slug=farol" },
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://diario.govsistem.com.br/farol/edicoes"
    );
    expect(
      response.headers.get(`x-middleware-request-${INTERNAL_TENANT_HEADER}`)
    ).toBeNull();
  });

  it("removes a spoofed internal header when no tenant is resolved", () => {
    const response = middleware(
      new NextRequest("https://diario.govsistem.com.br/api/download/file.pdf", {
        headers: { [INTERNAL_TENANT_HEADER]: "farol" },
      })
    );

    expect(
      response.headers.get(`x-middleware-request-${INTERNAL_TENANT_HEADER}`)
    ).toBeNull();
  });
});
