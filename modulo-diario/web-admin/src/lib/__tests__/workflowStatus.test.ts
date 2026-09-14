import { describe, expect, it } from "vitest";
import {
  WORKFLOW_STATUS_LABEL,
  WORKFLOW_TRANSITIONS,
  nextWorkflowStatuses,
} from "../workflowStatus";

describe("workflowStatus", () => {
  it("rótulos cobrem todos os estados", () => {
    expect(Object.keys(WORKFLOW_STATUS_LABEL).sort()).toEqual(
      [
        "aguardando_assinatura",
        "aprovado",
        "assinado",
        "cancelado",
        "em_revisao",
        "gerado_pela_ia",
        "publicado",
        "rascunho",
      ].sort()
    );
  });

  it("estados terminais não possuem transições", () => {
    expect(WORKFLOW_TRANSITIONS.publicado).toEqual([]);
    expect(WORKFLOW_TRANSITIONS.cancelado).toEqual([]);
  });

  it("permite cancelar a partir de qualquer estado não-terminal", () => {
    for (const [from, targets] of Object.entries(WORKFLOW_TRANSITIONS)) {
      if (from === "publicado" || from === "cancelado") continue;
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
