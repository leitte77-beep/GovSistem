import type { BenefitTypeOut } from "@/tipos/dominios";

/**
 * Resolve o rótulo pt-BR de um código de benefício. O mapa é preenchido a partir
 * dos tipos carregados do backend; enquanto isso, usa um fallback amigável.
 */
let mapa: Record<string, string> = {};

export function registrarTiposBeneficio(tipos: BenefitTypeOut[]) {
  mapa = Object.fromEntries(tipos.map((t) => [t.code, t.nome]));
}

export function rotuloBeneficio(code: string): string {
  return mapa[code] ?? code;
}
