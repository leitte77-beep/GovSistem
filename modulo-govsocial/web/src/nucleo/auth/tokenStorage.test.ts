import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bootstrapTokenDaShell,
  criarHandoffToken,
  gravarAccessToken,
  lerAccessToken,
} from "@/nucleo/auth/tokenStorage";

/** Simula a aba nova aberta com noopener: sessionStorage nasce vazio. */
function novaAba(url: string) {
  sessionStorage.clear();
  window.history.replaceState({}, "", url);
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("bootstrapTokenDaShell — token da shell", () => {
  it("move o ?token= para o sessionStorage e limpa a URL", () => {
    window.history.replaceState({}, "", "/inicio?token=abc123&aba=fila");
    bootstrapTokenDaShell();
    expect(lerAccessToken()).toBe("abc123");
    expect(window.location.search).toBe("?aba=fila");
  });
});

describe("handoff de impressão", () => {
  it("entrega o token à aba de impressão sem passá-lo na URL", () => {
    gravarAccessToken("token-da-sessao");
    const nonce = criarHandoffToken();
    expect(nonce).toBeTruthy();

    novaAba(`/imprimir/guia/123?h=${nonce}`);
    expect(lerAccessToken()).toBeNull();

    bootstrapTokenDaShell();
    expect(lerAccessToken()).toBe("token-da-sessao");
    expect(window.location.search).toBe("");
  });

  it("aceita o nonce uma única vez", () => {
    gravarAccessToken("token-da-sessao");
    const nonce = criarHandoffToken();

    novaAba(`/imprimir/guia/123?h=${nonce}`);
    bootstrapTokenDaShell();

    novaAba(`/imprimir/guia/123?h=${nonce}`);
    bootstrapTokenDaShell();
    expect(lerAccessToken()).toBeNull();
  });

  it("ignora nonce vencido e não deixa resíduo no localStorage", () => {
    vi.useFakeTimers();
    try {
      gravarAccessToken("token-da-sessao");
      const nonce = criarHandoffToken();
      vi.advanceTimersByTime(31_000);

      novaAba(`/imprimir/guia/123?h=${nonce}`);
      bootstrapTokenDaShell();
      expect(lerAccessToken()).toBeNull();
      expect(Object.keys(localStorage)).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("não gera nonce quando a aba não tem sessão", () => {
    expect(criarHandoffToken()).toBeNull();
    expect(Object.keys(localStorage)).toHaveLength(0);
  });

  it("mantém abas de tenants diferentes isoladas", () => {
    gravarAccessToken("token-tenant-a");
    const nonceA = criarHandoffToken();
    // Outra aba, outro tenant: gera o próprio nonce sem sobrescrever o primeiro.
    gravarAccessToken("token-tenant-b");
    const nonceB = criarHandoffToken();

    novaAba(`/imprimir/dashboard?h=${nonceA}`);
    bootstrapTokenDaShell();
    expect(lerAccessToken()).toBe("token-tenant-a");

    novaAba(`/imprimir/dashboard?h=${nonceB}`);
    bootstrapTokenDaShell();
    expect(lerAccessToken()).toBe("token-tenant-b");
  });
});
