import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Recomendacoes } from "./InicioPorPerfil";

const { mockUseRecommendationScope, mockUsePermissao } = vi.hoisted(() => ({
  mockUseRecommendationScope: vi.fn(),
  mockUsePermissao: vi.fn(() => true),
}));

vi.mock("@/nucleo/api/hooks", () => ({
  useRecommendationScope: mockUseRecommendationScope,
}));

vi.mock("@/nucleo/permissoes/usePermissao", () => ({
  usePermissao: mockUsePermissao,
}));

function renderizar() {
  return render(
    <MemoryRouter>
      <Recomendacoes />
    </MemoryRouter>,
  );
}

describe("Recomendacoes (dashboard)", () => {
  it("estado erro: mostra 'Ações rápidas' com a grade estática (degradação graciosa)", () => {
    mockUseRecommendationScope.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderizar();
    expect(screen.getByText("Ações rápidas")).toBeTruthy();
    expect(screen.getByText("Buscar famílias")).toBeTruthy();
  });

  it("estado vazio: serviço ok com 0 regras mostra 'Recomendações' + tudo em dia + 2 atalhos", () => {
    mockUseRecommendationScope.mockReturnValue({
      data: {
        rmaFechado: true,
        diasAteFimDoMes: 15,
        mesAtual: "jul/2026",
        nisPendentes: 0,
        semAtendimento90d: 0,
        agendamentosHoje: 0,
        aniversariantesSemana: 0,
        encaminhamentosPrazo: 0,
      },
      isLoading: false,
      isError: false,
    });
    renderizar();
    expect(screen.getByText("Recomendações")).toBeTruthy();
    expect(screen.getByText(/Tudo em dia por enquanto/)).toBeTruthy();
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
  });

  it("estado com regras: serviço ok com ≥1 regra mostra 'Recomendações' + cards", () => {
    mockUseRecommendationScope.mockReturnValue({
      data: {
        rmaFechado: false,
        diasAteFimDoMes: 2,
        mesAtual: "jul/2026",
        nisPendentes: 0,
        semAtendimento90d: 0,
        agendamentosHoje: 0,
        aniversariantesSemana: 0,
        encaminhamentosPrazo: 0,
      },
      isLoading: false,
      isError: false,
    });
    renderizar();
    expect(screen.getByText("Recomendações")).toBeTruthy();
    expect(screen.getByText(/Fechamento do RMA/)).toBeTruthy();
  });
});
