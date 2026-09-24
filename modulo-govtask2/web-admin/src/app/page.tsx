"use client";

/**
 * A porta de entrada muda conforme o papel da pessoa no fluxo:
 *
 *   Prefeito (e consulta)  → Meu governo: onde está, há quanto tempo, por quê
 *   Assessor               → Central de despacho
 *   Departamento           → Minha fila
 */

import { CentralAssessor } from "@/components/painel/CentralAssessor";
import { EsqueletoPainel } from "@/components/painel/Blocos";
import { MinhaFila } from "@/components/painel/MinhaFila";
import { PainelPrefeito } from "@/components/painel/PainelPrefeito";
import { useSessao } from "@/lib/sessao";

export default function Inicio() {
  const { perfil, pronto } = useSessao();
  if (!pronto) return <EsqueletoPainel />;
  if (perfil === "assessor") return <CentralAssessor />;
  if (perfil === "departamento") return <MinhaFila />;
  return <PainelPrefeito />;
}
