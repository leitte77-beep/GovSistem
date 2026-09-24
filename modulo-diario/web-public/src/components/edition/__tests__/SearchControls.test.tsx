import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SearchControls from "../SearchControls";
import type { MatterMeta } from "@/lib/edition-types";

const matters: MatterMeta[] = [
  {
    id: "m1",
    anchorId: "materia-1",
    position: 0,
    title: "Contrato nº 5/2026",
    summary: "Contratação de serviços",
    section: "Licitações",
  },
  {
    id: "m2",
    anchorId: "materia-2",
    position: 1,
    title: "Portaria nº 9/2026",
    summary: "Nomeação de servidor",
    section: "Administração",
  },
];

function renderHarness() {
  const { container } = render(
    <div>
      <SearchControls matters={matters} />
      <section id="materia-1" data-testid="m1">Conteúdo de contrato aqui</section>
      <section id="materia-2" data-testid="m2">Conteúdo de portaria aqui</section>
    </div>,
  );
  return container;
}

function el(id: string) {
  return document.getElementById(id) as HTMLElement;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("SearchControls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("search announces matches and hides non-matching matter", async () => {
    renderHarness();
    expect(el("materia-1").hidden).toBe(false);
    expect(el("materia-2").hidden).toBe(false);

    const input = screen.getByLabelText(/Pesquisar nesta edição/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "contrato" } });

    await delay(280);

    expect(el("materia-1").hidden).toBe(false); // matches content
    expect(el("materia-2").hidden).toBe(true); // portaria hidden
    expect(screen.getByTestId("search-status").textContent).toMatch(/1 resultado/);
  });

  it("clear resets visibility", async () => {
    renderHarness();
    const input = screen.getByLabelText(/Pesquisar nesta edição/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "portaria" } });
    await delay(280);
    expect(el("materia-2").hidden).toBe(false);
    expect(el("materia-1").hidden).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Limpar busca/ }));
    await delay(280);
    expect(el("materia-1").hidden).toBe(false);
    expect(el("materia-2").hidden).toBe(false);
  });

  it("filters by legal kind", async () => {
    renderHarness();
    fireEvent.click(screen.getByRole("button", { name: /Portarias/ }));
    await delay(50);
    expect(el("materia-2").hidden).toBe(false);
    expect(el("materia-1").hidden).toBe(true);
  });
});
