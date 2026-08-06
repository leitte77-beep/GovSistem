import { describe, expect, it } from "vitest";
import { montarTrilha, type ItemTimelineProntuario } from "@/paginas/familias/montarTrilha";
import type { NetworkViewItem } from "@/tipos/prontuario";

const timeline: ItemTimelineProntuario[] = [
  {
    attendance_id: "a1",
    case_file_id: "cf-1",
    data_atendimento: "2026-07-04T17:20:00Z",
    tipo: "FAMILIAR",
    service_type_code: "PAIF",
    unit_id: "u-norte",
    sigiloso_reforcado: false,
    pode_ler_evolucao: true,
  },
  {
    attendance_id: "a2",
    case_file_id: "cf-2",
    data_atendimento: "2026-06-20T14:00:00Z",
    tipo: "VISITA_DOMICILIAR",
    service_type_code: "PAIF",
    unit_id: "u-norte",
    sigiloso_reforcado: true,
    pode_ler_evolucao: true,
  },
];

const rede: NetworkViewItem[] = [
  // Duplicata do a1 (mesma unidade acessível) — deve ser ignorada.
  {
    unit_id: "u-norte",
    unit_nome: "CRAS Norte",
    service_type_code: "PAIF",
    data_atendimento: "2026-07-04T17:20:00Z",
    tipo: "FAMILIAR",
  },
  // Outra unidade (CREAS) — deve entrar como existência, sem conteúdo.
  {
    unit_id: "u-creas",
    unit_nome: "CREAS Municipal",
    service_type_code: "PAEFI",
    data_atendimento: "2026-06-15T10:00:00Z",
    tipo: "INDIVIDUAL",
  },
];

describe("montarTrilha", () => {
  it("agrupa por mês em ordem decrescente", () => {
    const meses = montarTrilha(timeline, rede, new Set(["u-norte"]));
    expect(meses.map((m) => m.chave)).toEqual(["2026-07", "2026-06"]);
  });

  it("não duplica evento que já veio na timeline", () => {
    const meses = montarTrilha(timeline, rede, new Set(["u-norte"]));
    const todos = meses.flatMap((m) => m.itens);
    const julho = todos.filter((i) => i.data.startsWith("2026-07"));
    expect(julho.length).toBe(1);
  });

  it("inclui evento de outra unidade como visão de rede (sem conteúdo)", () => {
    const meses = montarTrilha(timeline, rede, new Set(["u-norte"]));
    const creas = meses.flatMap((m) => m.itens).find((i) => i.unitId === "u-creas");
    expect(creas).toBeTruthy();
    expect(creas?.daPropriaUnidade).toBe(false);
    expect(creas?.attendanceId).toBeNull();
  });

  it("cada evento aponta para o prontuário de onde veio (revelação usa o case file certo)", () => {
    const meses = montarTrilha(timeline, rede, new Set(["u-norte"]));
    const todos = meses.flatMap((m) => m.itens);
    const a1 = todos.find((i) => i.attendanceId === "a1");
    const a2 = todos.find((i) => i.attendanceId === "a2");
    expect(a1?.daPropriaUnidade).toBe(true);
    expect(a1?.caseFileId).toBe("cf-1");
    // Mesmo com dois prontuários na MESMA unidade, cada atendimento carrega
    // o seu próprio case file — era a causa do 404 na revelação.
    expect(a2?.caseFileId).toBe("cf-2");
  });
});
