import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let win: any;

beforeEach(() => {
  win = {
    location: {
      hostname: "localhost",
      pathname: "/",
      href: "http://localhost/",
      search: "",
      origin: "http://localhost",
    },
  };
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", {
    cookie: "",
  });
  vi.stubGlobal("fetch", vi.fn());
  vi.stubEnv("NEXT_PUBLIC_API_URL", "/api/v1");
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("getTenantSlug resolution", () => {
  it("extracts subdomain from .govsistem.com.br hostname", async () => {
    win.location.hostname = "prefeitura-municipal.govsistem.com.br";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [], pagination: {} }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { api } = await import("../api");
    await api.listEditions();

    const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string> | undefined;
    expect(headers?.["X-Tenant-Slug"]).toBe("prefeitura-municipal");
  });

  it("extracts slug from URL pathname first segment", async () => {
    win.location.hostname = "localhost";
    win.location.pathname = "/myprefeitura/diario-oficial/edicao/1";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [], pagination: {} }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { api } = await import("../api");
    await api.listEditions();

    const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string> | undefined;
    expect(headers?.["X-Tenant-Slug"]).toBe("myprefeitura");
  });

  it("falls back to tenant_slug cookie", async () => {
    win.location.hostname = "localhost";
    win.location.pathname = "/";
    document.cookie = "tenant_slug=cookie-prefeitura; path=/";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [], pagination: {} }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { api } = await import("../api");
    await api.listEditions();

    const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string> | undefined;
    expect(headers?.["X-Tenant-Slug"]).toBe("cookie-prefeitura");
  });

  it("returns no tenant header when no slug source matches", async () => {
    win.location.hostname = "example.com";
    win.location.pathname = "/";
    document.cookie = "";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [], pagination: {} }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { api } = await import("../api");
    await api.listEditions();

    const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string> | undefined;
    expect(headers?.["X-Tenant-Slug"]).toBeUndefined();
  });

  it("subdomain takes priority over pathname slug", async () => {
    win.location.hostname = "sub-prefeitura.govsistem.com.br";
    win.location.pathname = "/path-prefeitura/diario";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [], pagination: {} }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { api } = await import("../api");
    await api.listEditions();

    const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string> | undefined;
    expect(headers?.["X-Tenant-Slug"]).toBe("sub-prefeitura");
  });

  it("ignores invalid subdomain with dots", async () => {
    win.location.hostname = "a.b.govsistem.com.br";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [], pagination: {} }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { api } = await import("../api");
    await api.listEditions();

    const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string> | undefined;
    expect(headers?.["X-Tenant-Slug"]).toBeUndefined();
  });

  it("decodes URI-encoded cookie value", async () => {
    win.location.hostname = "localhost";
    win.location.pathname = "/";
    document.cookie = "tenant_slug=prefeitura%20municipal; path=/";

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [], pagination: {} }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { api } = await import("../api");
    await api.listEditions();

    const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string> | undefined;
    expect(headers?.["X-Tenant-Slug"]).toBe("prefeitura municipal");
  });
});

describe("API URL construction", () => {
  it("constructs edition list URL with query params", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [], pagination: { page: 1, page_size: 20, total: 0, total_pages: 0 } }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { api } = await import("../api");
    await api.listEditions({ year: 2025, type: "ordinaria", page: 1, page_size: 10 });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/api/public/v1/editions");
    expect(url).toContain("year=2025");
    expect(url).toContain("type=ordinaria");
  });

  it("constructs edition detail URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { api } = await import("../api");
    await api.getEdition(2025, 42);

    expect(mockFetch.mock.calls[0][0]).toContain("/api/public/v1/editions/by-year/2025/42");
  });

  it("constructs search URL with all params", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [], pagination: { page: 1, page_size: 20, total: 0, total_pages: 0 } }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { api } = await import("../api");
    await api.search({ q: "lei", act_type: "Lei", year: 2025, page: 1 });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("/api/public/v1/matters");
    expect(url).toContain("q=lei");
    expect(url).toContain("act_type=Lei");
    expect(url).toContain("year=2025");
  });

  it("constructs verify URL with code", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ valid: true }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { api } = await import("../api");
    await api.verify("ABCD-1234");

    expect(mockFetch.mock.calls[0][0]).toContain("/api/public/v1/verify/ABCD-1234");
  });

  it("constructs organization info URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "1", name: "Test" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { api } = await import("../api");
    await api.getOrganization();

    expect(mockFetch.mock.calls[0][0]).toContain("/api/public/v1/organization");
  });

  it("omits empty query params", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [], pagination: {} }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { api } = await import("../api");
    await api.listEditions({});

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toBe("/api/public/v1/editions");
  });
});

describe("API error handling", () => {
  it("throws on non-ok response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });
    vi.stubGlobal("fetch", mockFetch);

    const { api } = await import("../api");
    await expect(api.listEditions()).rejects.toThrow("HTTP 404");
  });

  it("throws on server error", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });
    vi.stubGlobal("fetch", mockFetch);

    const { api } = await import("../api");
    await expect(api.getOrganization()).rejects.toThrow("HTTP 500");
  });

  it("propagates fetch network errors", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
    vi.stubGlobal("fetch", mockFetch);

    const { api } = await import("../api");
    await expect(api.listEditions()).rejects.toThrow("Network error");
  });
});

describe("SSR safety", () => {
  it("getTenantSlug returns null when window is undefined", async () => {
    // Remove window stub to simulate SSR
    vi.unstubAllGlobals();
    vi.stubGlobal("window", undefined);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { api } = await import("../api");
    await api.getOrganization();

    const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string> | undefined;
    expect(headers?.["X-Tenant-Slug"]).toBeUndefined();
  });
});
