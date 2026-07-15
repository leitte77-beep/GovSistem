import type { ClaimsJwt, Papel } from "@/tipos/api";

/**
 * Decodifica o payload de um JWT sem validar assinatura (a shell já validou;
 * o backend revalida a cada request). Só extrai claims para montar a UI.
 * Nunca loga o conteúdo (§1.4).
 */
function base64UrlParaJson(seg: string): unknown {
  const base64 = seg.replace(/-/g, "+").replace(/_/g, "/");
  const preenchido = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const texto =
    typeof atob === "function"
      ? atob(preenchido)
      : Buffer.from(preenchido, "base64").toString("binary");
  const bytes = Uint8Array.from(texto, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function decodificarClaims(token: string): ClaimsJwt | null {
  const partes = token.split(".");
  if (partes.length < 2) return null;
  try {
    const payload = base64UrlParaJson(partes[1]) as Record<string, unknown>;
    const roles = Array.isArray(payload.roles) ? (payload.roles as Papel[]) : [];
    return {
      sub: String(payload.sub ?? ""),
      roles,
      organization_id: payload.organization_id ? String(payload.organization_id) : null,
      exp: typeof payload.exp === "number" ? payload.exp : undefined,
    };
  } catch {
    return null;
  }
}

export function tokenExpirado(claims: ClaimsJwt | null): boolean {
  if (!claims?.exp) return false;
  return claims.exp * 1000 <= Date.now();
}
