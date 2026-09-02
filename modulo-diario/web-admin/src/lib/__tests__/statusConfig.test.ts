import { describe, it, expect } from "vitest";
import {
  MATTER_STATUSES, EDITION_STATUSES, EDITION_TYPES,
  matterStatusLabel, editionStatusLabel, MATTER_ACTIONS, EDITION_ACTIONS,
} from "@/lib/statusConfig";

describe("mapas de status centralizados", () => {
  it("cobre todos os estados de matéria sem código interno no rótulo", () => {
    const codes = Object.keys(MATTER_STATUSES);
    expect(codes.sort()).toEqual(
      ["archived", "approved", "draft", "published", "rejected", "review"].sort(),
    );
    for (const s of codes) {
      const label = MATTER_STATUSES[s as keyof typeof MATTER_STATUSES].label;
      // rótulo em português; nunca o código interno
      expect(label.toLowerCase()).not.toBe(s);
      expect(label).toMatch(/[A-Za-zÀ-ú]/);
      expect(MATTER_STATUSES[s as keyof typeof MATTER_STATUSES].badge).toBeTruthy();
      expect(MATTER_STATUSES[s as keyof typeof MATTER_STATUSES].icon).toBeTruthy();
    }
  });

  it("cobre todos os estados de edição com rótulo em português", () => {
    const codes = Object.keys(EDITION_STATUSES);
    expect(codes).toContain("pdf_generated");
    for (const c of codes) {
      const label = EDITION_STATUSES[c as keyof typeof EDITION_STATUSES].label;
      expect(label).not.toBe(c);
    }
  });

  it("rótulos de matéria em português", () => {
    expect(matterStatusLabel("draft")).toBe("Rascunho");
    expect(matterStatusLabel("review")).toBe("Em revisão");
    expect(matterStatusLabel("approved")).toBe("Aprovada");
    expect(matterStatusLabel("rejected")).toBe("Rejeitada");
  });

  it("rótulos de edição em português", () => {
    expect(editionStatusLabel("scheduled")).toBe("Agendada");
    expect(editionStatusLabel("closed")).toBe("Fechada");
    expect(editionStatusLabel("pdf_generated")).toBe("PDF gerado");
    expect(editionStatusLabel("signed")).toBe("Assinada");
    expect(editionStatusLabel("published")).toBe("Publicada");
    expect(editionStatusLabel("cancelled")).toBe("Cancelada");
  });

  it("tipos de edição padronizados", () => {
    expect(EDITION_TYPES.normal).toBe("Normal");
    expect(EDITION_TYPES.extra).toBe("Extraordinária");
    expect(EDITION_TYPES.suplementar).toBe("Suplementar");
  });

  it("ações por estado nunca vazias", () => {
    for (const s of Object.keys(MATTER_ACTIONS)) {
      expect(MATTER_ACTIONS[s as keyof typeof MATTER_ACTIONS].length).toBeGreaterThan(0);
    }
    for (const s of Object.keys(EDITION_ACTIONS)) {
      expect(EDITION_ACTIONS[s as keyof typeof EDITION_ACTIONS].length).toBeGreaterThan(0);
    }
  });

  it("estados imutáveis (não editáveis) não oferecem ação 'edit'", () => {
    const nonEditableMatters: Array<keyof typeof MATTER_ACTIONS> = ["approved", "published", "archived", "review"];
    for (const s of nonEditableMatters) {
      expect(MATTER_ACTIONS[s].some((a) => a.key === "edit")).toBe(false);
    }
    const nonEditableEditions: Array<keyof typeof EDITION_ACTIONS> = [
      "closed", "pdf_generated", "signed", "published", "cancelled", "reviewing",
    ];
    for (const s of nonEditableEditions) {
      expect(EDITION_ACTIONS[s].some((a) => a.key === "edit")).toBe(false);
    }
  });
});
