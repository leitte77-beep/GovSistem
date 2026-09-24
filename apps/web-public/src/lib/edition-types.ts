export const TYPE_LABELS: Record<string, string> = {
  normal: "ORDINÁRIA",
  extra: "EXTRAORDINÁRIA",
  suplementar: "SUPLEMENTAR",
};

/** Normaliza o tipo vindo da API para uma das chaves conhecidas. */
export function resolveEditionType(type: string): string {
  return Object.hasOwn(TYPE_LABELS, type) ? type : "normal";
}

export function editionTypeLabel(type: string): string {
  return TYPE_LABELS[resolveEditionType(type)];
}
