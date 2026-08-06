import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FluxoStatus } from "@/ui/FluxoStatus";
import { ETAPAS_CONCESSAO, indiceStatusConcessao } from "@/ui/fluxoConcessao";

describe("indiceStatusConcessao", () => {
  it("mapeia os status principais para índices", () => {
    expect(indiceStatusConcessao("SOLICITADO")).toEqual({ indice: 0, cancelado: false });
    expect(indiceStatusConcessao("EM_ANALISE")).toEqual({ indice: 1, cancelado: false });
    expect(indiceStatusConcessao("APROVADO")).toEqual({ indice: 2, cancelado: false });
    expect(indiceStatusConcessao("ENTREGUE")).toEqual({ indice: 3, cancelado: false });
  });

  it("sinaliza negado/cancelado", () => {
    expect(indiceStatusConcessao("NEGADO").cancelado).toBe(true);
    expect(indiceStatusConcessao("CANCELADO").cancelado).toBe(true);
  });
});

describe("<FluxoStatus>", () => {
  it("renderiza as 4 etapas e marca a atual com aria-current", () => {
    render(<FluxoStatus etapas={ETAPAS_CONCESSAO} atual={2} />);
    expect(screen.getByRole("list", { name: "Andamento" })).toBeInTheDocument();
    expect(screen.getByText("Solicitado")).toBeInTheDocument();
    expect(screen.getByText("Entrega")).toBeInTheDocument();
    // A etapa atual tem o sufixo de leitor de tela.
    expect(screen.getByText("(etapa atual)")).toBeInTheDocument();
  });
});
