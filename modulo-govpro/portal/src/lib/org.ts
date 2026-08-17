"use client";

const KEY_SLUG = "govpro_org_slug";
const KEY_NOME = "govpro_org_nome";

export function getOrgSlug(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY_SLUG);
}

export function getOrgNome(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(KEY_NOME);
}

export function setOrg(slug: string, nome: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_SLUG, slug);
  localStorage.setItem(KEY_NOME, nome);
}

export function clearOrg() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY_SLUG);
  localStorage.removeItem(KEY_NOME);
}
