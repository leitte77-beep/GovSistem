import { describe, expect, it } from "vitest";
import {
  WORKFLOW_STATUS_LABEL,
  WORKFLOW_TRANSITIONS,
  nextWorkflowStatuses,
} from "../workflowStatus";

const TERMINAL = ["retificada", "substituida", "cancelado"] as const;

describe("workflowStatus", () => {
  it("rótulos cobrem todos os estados", () => {
    expect(Object.keys(WORKFLOW_STATUS_LABEL).sort()).toEqual(
      [
        "aguardando_aprovacao",
        "aguardando_assinatura",
        "aguardando_publicacao",
        "aguardando_revisao",
        "aprovado",
        "assinado",
        "cancelado",
        "devolvida_para_correcao",
        "em_elaboracao",
        "em_revisao",
        "gerado_pela_ia",
        "inserida_em_edicao",
        "publicado",
        "rascunho",
        "retificada",
        "substituida",
      ].sort()
    );
  });

  it("estados terminais não possuem transições", () => {
    for (const state of TERMINAL) {
      expect(WORKFLOW_TRANSITIONS[state]).toEqual([]);
    }
  });

  it("publicado segue para retificação/substituição, não para cancelado", () => {
    expect(WORKFLOW_TRANSITIONS.publicado).toEqual(["retificada", "substituida"]);
    expect(WORKFLOW_TRANSITIONS.publicado).not.toContain("cancelado");
  });

  it("permite cancelar a partir de qualquer estado editorial ativo", () => {
    for (const [from, targets] of Object.entries(WORKFLOW_TRANSITIONS)) {
      if (from === "publicado" || (TERMINAL as readonly string[]).includes(from)) {
        continue;
      }
      expect(targets).toContain("cancelado");
    }
  });

  it("nextWorkflowStatuses trata nulo/legado como rascunho", () => {
    expect(nextWorkflowStatuses(null)).toEqual(WORKFLOW_TRANSITIONS.rascunho);
    expect(nextWorkflowStatuses(undefined)).toEqual(WORKFLOW_TRANSITIONS.rascunho);
  });

  it("nextWorkflowStatuses devolve vazio para estado desconhecido", () => {
    expect(nextWorkflowStatuses("inexistente")).toEqual([]);
  });
});
