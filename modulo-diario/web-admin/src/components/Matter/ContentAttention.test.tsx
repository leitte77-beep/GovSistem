import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ContentAttention from "./ContentAttention";
import type { ContentWarning } from "@/types/matter";

const mismatch: ContentWarning = {
  code: "type_mismatch",
  level: "warning",
  message: "O texto colado começa como um ato de compras/licitação, mas o tipo do ato selecionado (“Portaria”) indica outra coisa.",
  detail: "Confira se o texto colado é desta matéria ou corrija o tipo/título.",
  excerpt: "Aviso de dispensa de licitação",
};
const masthead: ContentWarning = {
  code: "pasted_masthead",
  level: "info",
  message: "O cabeçalho de um diário foi colado junto com o texto.",
  detail: "Ele é retirado automaticamente na publicação; não precisa apagar.",
  excerpt: "DIÁRIO OFICIAL ELETRÔNICO ANO: EDIÇÃO Nº",
};

describe("ContentAttention", () => {
  it("lista os avisos com o trecho do texto e conta só os que pedem conferência", () => {
    render(<ContentAttention warnings={[masthead, mismatch]} />);
    expect(screen.getByRole("heading", { name: /Pontos de atenção/ })).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText(/“Aviso de dispensa de licitação”/)).toBeInTheDocument();
    // Aviso que pede conferência vem antes do informativo.
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Portaria");
    expect(items[1]).toHaveTextContent("cabeçalho");
  });

  it("diz que está tudo certo quando não há avisos", () => {
    render(<ContentAttention warnings={[]} />);
    expect(screen.getByText("Nenhum ponto de atenção no texto.")).toBeInTheDocument();
  });

  it("versão compacta omite a explicação longa", () => {
    render(<ContentAttention warnings={[mismatch]} compact />);
    expect(screen.queryByText(/Confira se o texto colado é desta matéria/)).toBeNull();
  });
});
