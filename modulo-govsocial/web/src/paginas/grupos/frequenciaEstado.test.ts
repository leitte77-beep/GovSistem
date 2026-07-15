import { describe, expect, it } from "vitest";
import {
  estadoParaRegistro,
  registroParaEstado,
  resumirChamada,
  ROTULO_PRESENCA,
  type EstadoPresenca,
} from "@/paginas/grupos/frequenciaEstado";

describe("frequenciaEstado", () => {
  describe("estadoParaRegistro", () => {
    it("PRESENTE → presente:true, justificativa:null", () => {
      expect(estadoParaRegistro("i1", "PRESENTE")).toEqual({
        inscricao_id: "i1",
        presente: true,
        justificativa: null,
      });
    });

    it("FALTA → presente:false, justificativa:null", () => {
      expect(estadoParaRegistro("i1", "FALTA")).toEqual({
        inscricao_id: "i1",
        presente: false,
        justificativa: null,
      });
    });

    it("JUSTIFICADA usa o texto informado", () => {
      expect(estadoParaRegistro("i1", "JUSTIFICADA", "Consulta médica")).toEqual({
        inscricao_id: "i1",
        presente: false,
        justificativa: "Consulta médica",
      });
    });

    it("JUSTIFICADA sem texto cai no padrão 'Falta justificada'", () => {
      expect(estadoParaRegistro("i1", "JUSTIFICADA", "   ").justificativa).toBe(
        "Falta justificada",
      );
      expect(estadoParaRegistro("i1", "JUSTIFICADA").justificativa).toBe("Falta justificada");
    });
  });

  describe("registroParaEstado", () => {
    it("presente:true → PRESENTE (ignora justificativa)", () => {
      expect(registroParaEstado({ presente: true, justificativa: null })).toBe("PRESENTE");
      expect(registroParaEstado({ presente: true, justificativa: "x" })).toBe("PRESENTE");
    });

    it("presente:false sem justificativa → FALTA", () => {
      expect(registroParaEstado({ presente: false, justificativa: null })).toBe("FALTA");
    });

    it("presente:false com justificativa → JUSTIFICADA", () => {
      expect(registroParaEstado({ presente: false, justificativa: "Doença" })).toBe(
        "JUSTIFICADA",
      );
    });
  });

  describe("resumirChamada", () => {
    it("conta presentes, faltas e justificadas", () => {
      const estados: EstadoPresenca[] = [
        "PRESENTE",
        "PRESENTE",
        "FALTA",
        "JUSTIFICADA",
        "PRESENTE",
      ];
      expect(resumirChamada(estados)).toEqual({
        presentes: 3,
        faltas: 1,
        justificadas: 1,
      });
    });

    it("resumo vazio quando não há estados", () => {
      expect(resumirChamada([])).toEqual({ presentes: 0, faltas: 0, justificadas: 0 });
    });
  });

  it("ida e volta estado ↔ registro é consistente", () => {
    const casos: EstadoPresenca[] = ["PRESENTE", "FALTA", "JUSTIFICADA"];
    for (const estado of casos) {
      const reg = estadoParaRegistro("i1", estado, estado === "JUSTIFICADA" ? "motivo" : null);
      expect(registroParaEstado(reg)).toBe(estado);
    }
  });

  it("rótulos em pt-BR para cada estado", () => {
    expect(ROTULO_PRESENCA.PRESENTE).toBe("Presente");
    expect(ROTULO_PRESENCA.FALTA).toBe("Falta");
    expect(ROTULO_PRESENCA.JUSTIFICADA).toBe("Justificada");
  });
});
