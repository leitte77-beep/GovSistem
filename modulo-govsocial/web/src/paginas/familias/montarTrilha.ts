import type { NetworkViewItem, TimelineItem } from "@/tipos/prontuario";
import { tipoEventoDe, type TipoEvento } from "./eventos";

/**
 * Item de timeline anotado com o prontuário de origem. A timeline do backend
 * é por prontuário (case file); como uma família pode ter VÁRIOS prontuários
 * (até na mesma unidade — ex.: PAIF e ABORDAGEM), cada item precisa carregar
 * o case_file_id de onde veio para a revelação usar o endpoint certo.
 */
export type ItemTimelineProntuario = TimelineItem & { case_file_id: string };

/**
 * Item unificado da Trilha. Eventos das unidades acessíveis trazem o
 * attendance_id (permitem revelar a evolução); eventos de outras unidades
 * (visão de rede) NÃO têm attendance_id e nunca expõem conteúdo (§4.2).
 */
export type ItemTrilha = {
  id: string;
  data: string;
  tipo: TipoEvento;
  tipoAtendimento: string;
  serviceCode: string;
  unitId: string;
  unitNome: string | null;
  daPropriaUnidade: boolean;
  attendanceId: string | null;
  caseFileId: string | null;
  sigilosoReforcado: boolean;
  podeLerEvolucao: boolean;
};

export type MesTrilha = { chave: string; rotulo: string; itens: ItemTrilha[] };

function chaveMes(iso: string): string {
  return iso.slice(0, 7); // AAAA-MM
}

function rotuloMes(iso: string): string {
  const d = new Date(iso);
  const s = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Combina as timelines dos prontuários acessíveis (com attendance) e a visão
 * de rede (outras unidades, sem conteúdo), removendo duplicatas por
 * unidade+data, e agrupa por mês em ordem cronológica decrescente.
 */
export function montarTrilha(
  timeline: ItemTimelineProntuario[],
  rede: NetworkViewItem[],
  unidadesAcessiveis: Set<string>,
): MesTrilha[] {
  const itens: ItemTrilha[] = [];

  for (const t of timeline) {
    itens.push({
      id: `att-${t.attendance_id}`,
      data: t.data_atendimento,
      tipo: tipoEventoDe(t.service_type_code, t.tipo),
      tipoAtendimento: t.tipo,
      serviceCode: t.service_type_code,
      unitId: t.unit_id,
      unitNome: null,
      daPropriaUnidade: true,
      attendanceId: t.attendance_id,
      caseFileId: t.case_file_id,
      sigilosoReforcado: t.sigiloso_reforcado,
      podeLerEvolucao: t.pode_ler_evolucao,
    });
  }

  // Da visão de rede, adiciona apenas eventos de unidades NÃO acessíveis
  // (as acessíveis já vieram na timeline, com conteúdo revelável).
  const jaVistos = new Set(
    timeline.map((t) => `${t.unit_id}|${t.data_atendimento}|${t.service_type_code}`),
  );
  for (const r of rede) {
    const chave = `${r.unit_id}|${r.data_atendimento}|${r.service_type_code}`;
    if (unidadesAcessiveis.has(r.unit_id)) continue;
    if (jaVistos.has(chave)) continue;
    jaVistos.add(chave);
    itens.push({
      id: `rede-${chave}`,
      data: r.data_atendimento,
      tipo: tipoEventoDe(r.service_type_code, r.tipo),
      tipoAtendimento: r.tipo,
      serviceCode: r.service_type_code,
      unitId: r.unit_id,
      unitNome: r.unit_nome,
      daPropriaUnidade: false,
      attendanceId: null,
      caseFileId: null,
      sigilosoReforcado: false,
      podeLerEvolucao: false,
    });
  }

  itens.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));

  const meses: MesTrilha[] = [];
  const indice = new Map<string, MesTrilha>();
  for (const item of itens) {
    const k = chaveMes(item.data);
    let m = indice.get(k);
    if (!m) {
      m = { chave: k, rotulo: rotuloMes(item.data), itens: [] };
      indice.set(k, m);
      meses.push(m);
    }
    m.itens.push(item);
  }
  return meses;
}
