"use client";

/**
 * Quem está usando e qual é o seu papel no fluxo. Carregado uma vez e
 * compartilhado — antes cada tela buscava `/eu` por conta própria.
 *
 *   prefeito      acompanha: onde está, há quanto tempo, por quê
 *   assessor      conduz: encaminha, cobra, recebe de volta
 *   departamento  executa: assume, anexa, devolve
 *   consulta      só lê
 */

import { createContext, useContext, useEffect, useState } from "react";

import { api, type Eu } from "@/lib/api";

export type Perfil = "prefeito" | "assessor" | "departamento" | "consulta";

export function perfilDe(eu: Eu | null): Perfil {
  if (!eu) return "consulta";
  // O servidor já resolve o perfil (o definido no módulo vence a plataforma).
  if (eu.perfil) return eu.perfil.toLowerCase() as Perfil;
  if (eu.pode_encaminhar) return "assessor";
  if (eu.papeis.includes("PREFEITO")) return "prefeito";
  if (eu.pode_trabalhar) return "departamento";
  return "consulta";
}

export const ROTULO_PERFIL: Record<Perfil, string> = {
  prefeito: "Prefeito",
  assessor: "Assessoria",
  departamento: "Departamento",
  consulta: "Consulta",
};

interface Sessao {
  eu: Eu | null;
  perfil: Perfil;
  pronto: boolean;
}

const Ctx = createContext<Sessao>({ eu: null, perfil: "consulta", pronto: false });

export function SessaoProvider({ children }: { children: React.ReactNode }) {
  const [eu, setEu] = useState<Eu | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    api
      .eu()
      .then(setEu)
      .catch(() => setEu(null))
      .finally(() => setPronto(true));
  }, []);

  return (
    <Ctx.Provider value={{ eu, perfil: perfilDe(eu), pronto }}>{children}</Ctx.Provider>
  );
}

export function useSessao() {
  return useContext(Ctx);
}

export function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/);
  return (
    (partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")
  ).toUpperCase();
}
