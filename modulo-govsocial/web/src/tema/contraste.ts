/**
 * Cálculo de contraste WCAG 2.1 (relative luminance + ratio).
 * Usado pela tematização por tenant: a cor de destaque do município só é
 * aplicada em decoração se atingir o mínimo exigido; caso contrário, cai no
 * padrão do produto (§2 — "verificação automática de contraste").
 */

export type RGB = { r: number; g: number; b: number };

export function hexParaRgb(hex: string): RGB | null {
  const limpo = hex.trim().replace(/^#/, "");
  const expandido =
    limpo.length === 3
      ? limpo
          .split("")
          .map((c) => c + c)
          .join("")
      : limpo;
  if (!/^[0-9a-fA-F]{6}$/.test(expandido)) return null;
  return {
    r: parseInt(expandido.slice(0, 2), 16),
    g: parseInt(expandido.slice(2, 4), 16),
    b: parseInt(expandido.slice(4, 6), 16),
  };
}

function canalLinear(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function luminancia({ r, g, b }: RGB): number {
  return 0.2126 * canalLinear(r) + 0.7152 * canalLinear(g) + 0.0722 * canalLinear(b);
}

/** Razão de contraste entre duas cores (1..21). */
export function razaoContraste(corA: string, corB: string): number {
  const a = hexParaRgb(corA);
  const b = hexParaRgb(corB);
  if (!a || !b) return 1;
  const la = luminancia(a);
  const lb = luminancia(b);
  const [claro, escuro] = la >= lb ? [la, lb] : [lb, la];
  return (claro + 0.05) / (escuro + 0.05);
}

/**
 * A barra de destaque decorativa precisa contrastar com o texto que a acompanha
 * (branco ou tinta). Exigimos ao menos 3:1 (componente/gráfico não-textual, AA)
 * contra o texto que ficará sobre ela.
 */
export function corDestaqueAprovada(
  corTenant: string | null | undefined,
  textoSobre: string,
): boolean {
  if (!corTenant) return false;
  if (!hexParaRgb(corTenant)) return false;
  return razaoContraste(corTenant, textoSobre) >= 3;
}
