import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { EditorEvolucao } from "@/ui/EditorEvolucao";
import { SeletorMembros } from "@/paginas/familias/SeletorMembros";
import type { MemberOut } from "@/tipos/pessoas";

describe("<EditorEvolucao>", () => {
  it("tem toolbar acessível e área de texto rotulada", () => {
    render(<EditorEvolucao valor="" aoMudar={() => {}} rascunhoEm={null} />);
    expect(screen.getByRole("toolbar", { name: "Formatação do texto" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Negrito/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Itálico/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sublinhado/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lista numerada" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Desfazer/ })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Evolução técnica" })).toBeInTheDocument();
  });

  it("mostra contador de palavras e caracteres", () => {
    render(
      <EditorEvolucao valor="<p>Visita domiciliar realizada</p>" aoMudar={() => {}} rascunhoEm={null} />,
    );
    expect(screen.getByText(/3 palavras · 27 caracteres/)).toBeInTheDocument();
  });

  it("mostra o horário do último autosave", () => {
    render(<EditorEvolucao valor="" aoMudar={() => {}} rascunhoEm="2026-07-04T14:32:00Z" />);
    expect(screen.getByText(/Rascunho salvo às/)).toBeInTheDocument();
  });
});

const membros: MemberOut[] = [
  {
    membership_id: "m1",
    person_id: "p1",
    nome_exibicao: "Maria",
    parentesco: "RESPONSAVEL",
    status: "ATIVO",
    data_entrada: "2024-01-10",
    data_saida: null,
    is_responsavel: true,
  },
  {
    membership_id: "m2",
    person_id: "p2",
    nome_exibicao: "João",
    parentesco: "FILHO",
    status: "ATIVO",
    data_entrada: "2024-01-10",
    data_saida: null,
    is_responsavel: false,
  },
];

describe("<SeletorMembros>", () => {
  it("alterna seleção por toque (aria-pressed)", async () => {
    const user = userEvent.setup();
    function Demo() {
      const [sel, setSel] = useState<Set<string>>(new Set());
      return (
        <SeletorMembros
          membros={membros}
          selecionados={sel}
          aoAlternar={(id) =>
            setSel((s) => {
              const n = new Set(s);
              n.has(id) ? n.delete(id) : n.add(id);
              return n;
            })
          }
        />
      );
    }
    render(<Demo />);
    const chip = screen.getByRole("button", { name: /Maria/ });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    await user.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
  });
});
