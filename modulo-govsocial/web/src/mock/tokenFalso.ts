import type { Papel } from "@/tipos/api";
import { TENANT } from "./fixtures/novaEsperanca";

/**
 * Gera um JWT "falso" (assinatura fixa, não validada no front) para o modo mock,
 * com as claims que o backend emitiria: sub, roles[], organization_id.
 * Assim o SessaoProvider funciona igual ao ambiente real.
 */
function base64Url(obj: unknown): string {
  const json = JSON.stringify(obj);
  const b64 =
    typeof btoa === "function"
      ? btoa(unescape(encodeURIComponent(json)))
      : Buffer.from(json, "utf-8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function papelDoAmbiente(): Papel {
  const p = (import.meta.env.VITE_MOCK_ROLE || "tecnico_superior") as Papel;
  return p;
}

export function tokenFalso(papel: Papel): string {
  const header = { alg: "none", typ: "JWT" };
  const agora = Math.floor(Date.now() / 1000);
  const payload = {
    sub: `user-${papel}`,
    roles: [papel],
    organization_id: TENANT.id,
    iat: agora,
    exp: agora + 60 * 60 * 8,
  };
  return `${base64Url(header)}.${base64Url(payload)}.mock`;
}
