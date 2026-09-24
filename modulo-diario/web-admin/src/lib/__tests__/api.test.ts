import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => {
  vi.stubGlobal("window", {
    location: {
      hostname: "localhost",
      pathname: "/",
      href: "http://localhost/",
      search: "",
      origin: "http://localhost",
    },
    dispatchEvent: vi.fn(),
    history: {
      replaceState: vi.fn(),
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("fetch", vi.fn());
  vi.resetModules();

  // Clear localStorage/sessionStorage for each test
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("bootstrapTokenFromQuery", () => {
  it("extracts token from URL query string", async () => {
    (window as any).location.search = "?token=abc123";
    const mockReplaceState = vi.fn();
    (window as any).history.replaceState = mockReplaceState;

    const { bootstrapTokenFromQuery } = await import("../api");
    const token = bootstrapTokenFromQuery();

    expect(token).toBe("abc123");
    expect(sessionStorage.getItem("access_token")).toBe("abc123");
    expect(mockReplaceState).toHaveBeenCalledWith({}, "", "/");
  });

  it("returns null when no token in URL", async () => {
    (window as any).location.search = "";

    const { bootstrapTokenFromQuery } = await import("../api");
    const token = bootstrapTokenFromQuery();

    expect(token).toBeNull();
    expect(sessionStorage.getItem("access_token")).toBeNull();
  });

  it("returns null in SSR environment", async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal("window", undefined);

    const { bootstrapTokenFromQuery } = await import("../api");
    const token = bootstrapTokenFromQuery();

    expect(token).toBeNull();
  });
});

describe("token storage and retrieval", () => {
  it("api.login returns tokens", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: "at1", refresh_token: "rt1" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { api } = await import("../api");
    const result = await api.login("user@test.com", "pass");

    expect(result).toEqual({ access_token: "at1", refresh_token: "rt1" });
    expect(sessionStorage.getItem("access_token")).toBeNull();
  });

  it("api.login sends correct credentials", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ access_token: "at", refresh_token: "rt" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { api } = await import("../api");
    await api.login("admin@test.com", "secret123");

    const call = mockFetch.mock.calls[0];
    expect(call[0]).toBe("/api/v1/auth/login");
    expect(call[1]?.method).toBe("POST");
    expect(JSON.parse(call[1]?.body as string)).toEqual({
      email: "admin@test.com",
      password: "secret123",
    });
  });

  it("includes Authorization header when token exists", async () => {
    sessionStorage.setItem("access_token", "existing-token");

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { api } = await import("../api");
    await api.listMatters();

    const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer existing-token");
  });

  it("sends no Authorization header when token is missing", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { api } = await import("../api");
    await api.listActTypes();

    const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("does not set Content-Type for FormData requests", async () => {
    sessionStorage.setItem("access_token", "tk");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { api } = await import("../api");
    const file = new File(["content"], "test.pdf", { type: "application/pdf" });
    await api.uploadAttachment("matter-1", file);

    const headers = mockFetch.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
    expect(mockFetch.mock.calls[0][1]?.body).toBeInstanceOf(FormData);
  });
});

describe("token refresh logic", () => {
  it("refreshes token on 401 response", async () => {
    vi.useFakeTimers();
    sessionStorage.setItem("access_token", "expired");
    localStorage.setItem("refresh_token", "refresh-valid");

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: "new-at", refresh_token: "new-rt" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: "ok" }),
      });

    vi.stubGlobal("fetch", mockFetch);

    const { api } = await import("../api");
    const result = await api.listMatters();

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ data: "ok" });
    expect(sessionStorage.getItem("access_token")).toBe("new-at");
    expect(localStorage.getItem("refresh_token")).toBe("new-rt");

    vi.useRealTimers();
  });

  it("clears tokens on failed refresh", async () => {
    sessionStorage.setItem("access_token", "expired");
    localStorage.setItem("refresh_token", "invalid-rt");

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

    vi.stubGlobal("fetch", mockFetch);

    const { api, AuthError } = await import("../api");

    await expect(api.listMatters()).rejects.toThrow(AuthError);
    expect(sessionStorage.getItem("access_token")).toBeNull();
    expect(localStorage.getItem("refresh_token")).toBeNull();
  });

  it("dispatches auth:logout event on refresh failure", async () => {
    sessionStorage.setItem("access_token", "expired");
    localStorage.setItem("refresh_token", "bad");

    const dispatchEvent = vi.fn();
    (window as any).dispatchEvent = dispatchEvent;

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: false, status: 401 });

    vi.stubGlobal("fetch", mockFetch);

    const { api, AuthError } = await import("../api");

    await expect(api.listMatters()).rejects.toThrow(AuthError);
    expect(dispatchEvent).toHaveBeenCalled();
    const event = dispatchEvent.mock.calls[0][0] as Event;
    expect(event.type).toBe("auth:logout");
  });

  it("does not retry refresh more than once", async () => {
    sessionStorage.setItem("access_token", "expired");
    localStorage.setItem("refresh_token", "rt");

    let refreshCalls = 0;
    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url === "/api/v1/auth/refresh") {
        refreshCalls++;
        return Promise.resolve({ ok: false, status: 401 });
      }
      return Promise.resolve({ ok: false, status: 401 });
    });
    vi.stubGlobal("fetch", mockFetch);

    const { api, AuthError } = await import("../api");

    await expect(api.listMatters()).rejects.toThrow(AuthError);
    expect(refreshCalls).toBe(1);
  });

  it("handles network error during refresh", async () => {
    sessionStorage.setItem("access_token", "expired");
    localStorage.setItem("refresh_token", "rt");

    const dispatchEvent = vi.fn();
    (window as any).dispatchEvent = dispatchEvent;

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockRejectedValueOnce(new Error("Network down"));

    vi.stubGlobal("fetch", mockFetch);

    const { api, AuthError } = await import("../api");

    await expect(api.listMatters()).rejects.toThrow(AuthError);
    expect(sessionStorage.getItem("access_token")).toBeNull();
    expect(localStorage.getItem("refresh_token")).toBeNull();
    expect(dispatchEvent).toHaveBeenCalled();
  });
});

describe("API call construction", () => {
  it("sends proper POST for createMatter", async () => {
    sessionStorage.setItem("access_token", "tk");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "m1" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { api } = await import("../api");
    await api.createMatter({
      title: "New Matter",
      summary: "Test",
      act_type_id: "at1",
      content_html: "<p>test</p>",
    });

    const call = mockFetch.mock.calls[0];
    expect(call[0]).toBe("/api/v1/matters");
    expect(call[1]?.method).toBe("POST");
    const body = JSON.parse(call[1]?.body as string);
    expect(body.title).toBe("New Matter");
    expect(body.content_html).toBe("<p>test</p>");
  });

  it("sends PATCH for updateMatter", async () => {
    sessionStorage.setItem("access_token", "tk");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "m2" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { api } = await import("../api");
    await api.updateMatter("m2", { title: "Updated Title" });

    const call = mockFetch.mock.calls[0];
    expect(call[0]).toBe("/api/v1/matters/m2");
    expect(call[1]?.method).toBe("PATCH");
  });

  it("sends DELETE for deleteMatter", async () => {
    sessionStorage.setItem("access_token", "tk");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
    });
    vi.stubGlobal("fetch", mockFetch);

    const { api } = await import("../api");
    await api.deleteMatter("m3");

    expect(mockFetch.mock.calls[0][0]).toBe("/api/v1/matters/m3");
    expect(mockFetch.mock.calls[0][1]?.method).toBe("DELETE");
  });

  it("returns null for 204 responses", async () => {
    sessionStorage.setItem("access_token", "tk");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
    });
    vi.stubGlobal("fetch", mockFetch);

    const { api } = await import("../api");
    const result = await api.deleteUser("u1");

    expect(result).toBeNull();
  });

  it("sign edition sends signing data", async () => {
    sessionStorage.setItem("access_token", "tk");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ verification_code: "vc", signed_pdf_hash: "h", certificate_subject: "cs", certificate_serial: "cs2", signed_at: "now" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { api } = await import("../api");
    await api.signEdition("ed1", { reason: "Official", location: "City Hall" });

    const call = mockFetch.mock.calls[0];
    expect(call[1]?.method).toBe("POST");
    expect(JSON.parse(call[1]?.body as string)).toEqual({
      reason: "Official",
      location: "City Hall",
    });
  });

  it("throws ApiError detail on error response with detail field", async () => {
    sessionStorage.setItem("access_token", "tk");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ detail: "Validation failed" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { api } = await import("../api");
    await expect(api.createMatter({ title: "", summary: "", act_type_id: "", content_html: "" }))
      .rejects.toThrow("Validation failed");
  });

  it("throws generic error on response without detail", async () => {
    sessionStorage.setItem("access_token", "tk");
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { api } = await import("../api");
    await expect(api.listMatters()).rejects.toThrow("HTTP 403");
  });
});
