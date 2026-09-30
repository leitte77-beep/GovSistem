export const brl = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const litros = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} L`;
