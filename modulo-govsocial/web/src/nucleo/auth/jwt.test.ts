import { describe, expect, it } from "vitest";
import { decodificarClaims, tokenExpirado } from "@/nucleo/auth/jwt";
import { tokenFalso } from "@/mock/tokenFalso";

describe("decodificarClaims", () => {
  it("extrai sub, roles e organization_id de um JWT", () => {
    const token = tokenFalso("coordenador_unidade");
    const claims = decodificarClaims(token);
    expect(claims?.roles).toContain("coordenador_unidade");
    expect(claims?.organization_id).toBe("org-nova-esperanca");
    expect(claims?.sub).toBeTruthy();
  });

  it("retorna null para token malformado", () => {
    expect(decodificarClaims("nao-e-um-jwt")).toBeNull();
  });
});

describe("tokenExpirado", () => {
  it("detecta expiração", () => {
    expect(tokenExpirado({ sub: "x", roles: [], organization_id: null, exp: 1 })).toBe(true);
    const futuro = Math.floor(Date.now() / 1000) + 3600;
    expect(
      tokenExpirado({ sub: "x", roles: [], organization_id: null, exp: futuro }),
    ).toBe(false);
  });
});
