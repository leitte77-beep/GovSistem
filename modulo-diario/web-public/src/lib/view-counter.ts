import { api } from "@/lib/api";

/**
 * Conta uma vez por sessão do navegador: na primeira vez registra (POST),
 * nas seguintes só lê o total (GET). Sem sessionStorage (aba privada
 * restrita), apenas lê — melhor subcontar do que inflar.
 */
async function countOnce<T>(key: string, register: () => Promise<T>, read: () => Promise<T>): Promise<T> {
  let seen = true;
  try {
    seen = sessionStorage.getItem(key) === "1";
    if (!seen) sessionStorage.setItem(key, "1");
  } catch {
    seen = true;
  }
  return seen ? read() : register();
}

export function trackPortalVisit() {
  return countOnce("doe:visit", api.registerPortalVisit, api.portalVisits).then((r) => r.visits);
}

export function trackEditionView(editionId: string) {
  return countOnce(
    `doe:view:${editionId}`,
    () => api.registerEditionView(editionId),
    () => api.editionViews(editionId),
  ).then((r) => r.views);
}

export const formatCount = (n: number) => n.toLocaleString("pt-BR");
