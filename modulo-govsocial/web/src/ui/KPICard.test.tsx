import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { KPICard } from "./KPICard";

function renderizar(props: React.ComponentProps<typeof KPICard>) {
  return render(
    <MemoryRouter>
      <KPICard {...props} />
    </MemoryRouter>,
  );
}

describe("KPICard", () => {
  it("renderiza valor e label", () => {
    renderizar({ label: "Atendimentos", value: 6 });
    expect(screen.getByText("Atendimentos")).toBeTruthy();
    expect(screen.getByText("6")).toBeTruthy();
  });

  it("mostra hint quando valor é zero", () => {
    renderizar({ label: "Atendimentos", value: 0, hint: "nenhum registrado neste mês" });
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.getByText("nenhum registrado neste mês")).toBeTruthy();
  });

  it("renderiza delta quando presente", () => {
    renderizar({
      label: "Atendimentos",
      value: 12,
      delta: { direction: "up", percent: 15, label: "vs. mês anterior" },
    });
    expect(screen.getByText("15%")).toBeTruthy();
    expect(screen.getByText("vs. mês anterior")).toBeTruthy();
  });

  it("NÃO renderiza sparkline com array vazio", () => {
    const { container } = renderizar({ label: "X", value: 10, sparkline: [] });
    expect(container.querySelector("svg")).toBeNull();
  });

  it("NÃO renderiza sparkline sem variação (todos os valores iguais)", () => {
    const { container } = renderizar({ label: "X", value: 10, sparkline: [3, 3, 3] });
    expect(container.querySelector("svg")).toBeNull();
  });

  it("renderiza sparkline com variação e >= 2 pontos", () => {
    const { container } = renderizar({ label: "X", value: 10, sparkline: [3, 5, 4] });
    expect(container.querySelector("svg")).toBeTruthy();
  });

  // FIX 1 (rodada 3) — os 4 casos exigidos, cada um assertando ZERO
  // elementos gráficos no DOM (svg/path/line/polyline), nunca só "svg".
  describe("hasSparkline — os 4 casos exigidos", () => {
    const semGraficoNoDOM = (container: HTMLElement) => {
      expect(container.querySelectorAll("svg, path, line, polyline").length).toBe(0);
    };

    it("sparkline = undefined → 0 elementos de gráfico", () => {
      const { container } = renderizar({ label: "Atendimentos", value: 6, sparkline: undefined });
      semGraficoNoDOM(container);
    });

    it("sparkline = [] → 0 elementos de gráfico", () => {
      const { container } = renderizar({ label: "Atendimentos", value: 6, sparkline: [] });
      semGraficoNoDOM(container);
    });

    it("sparkline = [6] → 0 elementos de gráfico (caso do bug relatado)", () => {
      const { container } = renderizar({ label: "Atendimentos", value: 6, sparkline: [6] });
      semGraficoNoDOM(container);
    });

    it("sparkline = [2,4,3,6] → 1 elemento de gráfico renderizado", () => {
      const { container } = renderizar({ label: "Atendimentos", value: 6, sparkline: [2, 4, 3, 6] });
      expect(container.querySelectorAll("svg, path, line, polyline").length).toBeGreaterThan(0);
    });
  });

  // KILL-SWITCH: showDecoration=false zera o canto direito mesmo com série válida
  describe("KILL-SWITCH showDecoration", () => {
    const semGraficoNoDOM = (container: HTMLElement) => {
      expect(container.querySelectorAll("svg, path, line, polyline").length).toBe(0);
    };

    it("showDecoration=false + série válida → 0 elementos (kill-switch ativo)", () => {
      const { container } = renderizar({
        label: "Atendimentos",
        value: 6,
        sparkline: [2, 4, 3, 6],
        showDecoration: false,
      });
      semGraficoNoDOM(container);
    });

    it("showDecoration=false + sparkline=undefined → 0 elementos", () => {
      const { container } = renderizar({
        label: "Atendimentos",
        value: 6,
        sparkline: undefined,
        showDecoration: false,
      });
      semGraficoNoDOM(container);
    });

    it("showDecoration=true + série válida → SVG renderiza", () => {
      const { container } = renderizar({
        label: "Atendimentos",
        value: 6,
        sparkline: [2, 4, 3, 6],
        showDecoration: true,
      });
      expect(container.querySelectorAll("svg, path, line, polyline").length).toBeGreaterThan(0);
    });

    it("showDecoration omitido (default true) + série válida → SVG renderiza", () => {
      const { container } = renderizar({
        label: "Atendimentos",
        value: 6,
        sparkline: [2, 4, 3, 6],
      });
      expect(container.querySelectorAll("svg, path, line, polyline").length).toBeGreaterThan(0);
    });
  });

  it("renderiza como link quando to é fornecido", () => {
    renderizar({ label: "Famílias", value: 100, to: "/familias" });
    const link = screen.getByRole("link");
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/familias");
  });

  it("renderiza skeleton quando loading", () => {
    renderizar({ label: "X", value: 0, loading: true });
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("renderiza -- quando erro", () => {
    renderizar({ label: "X", value: 0, error: true });
    expect(screen.getByText("--")).toBeTruthy();
  });

  it("aplica accent quando accent=true", () => {
    const { container } = renderizar({ label: "X", value: 10, accent: true });
    expect(container.querySelector(".ring-primary\\/20")).toBeTruthy();
  });
});
