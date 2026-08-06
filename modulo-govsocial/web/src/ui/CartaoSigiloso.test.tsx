import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CartaoSigiloso } from "@/ui/CartaoSigiloso";

type Payload = { evolution_text: string | null; evolution_restrita: boolean };

describe("<CartaoSigiloso>", () => {
  it("mostra estado velado com aviso de auditoria antes de revelar", () => {
    render(
      <CartaoSigiloso<Payload>
        buscar={async () => ({ evolution_text: "segredo", evolution_restrita: false })}
        extrairTexto={(d) => d.evolution_text}
        estaRestrito={(d) => d.evolution_restrita}
      />,
    );
    expect(screen.getByText(/sua visualização será registrada/i)).toBeInTheDocument();
    expect(screen.queryByText("segredo")).not.toBeInTheDocument();
  });

  it("revela o conteúdo sob demanda chamando o endpoint (auditoria)", async () => {
    const user = userEvent.setup();
    const buscar = vi.fn(async () => ({
      evolution_text: "Evolução técnica confidencial.",
      evolution_restrita: false,
    }));
    render(
      <CartaoSigiloso<Payload>
        buscar={buscar}
        extrairTexto={(d) => d.evolution_text}
        estaRestrito={(d) => d.evolution_restrita}
      />,
    );
    await user.click(screen.getByRole("button", { name: /ver conteúdo restrito/i }));
    await waitFor(() =>
      expect(screen.getByText("Evolução técnica confidencial.")).toBeInTheDocument(),
    );
    expect(buscar).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/sua visualização foi registrada/i)).toBeInTheDocument();
  });

  it("mostra aviso de restrição quando a política nega", async () => {
    const user = userEvent.setup();
    render(
      <CartaoSigiloso<Payload>
        buscar={async () => ({ evolution_text: null, evolution_restrita: true })}
        extrairTexto={(d) => d.evolution_text}
        estaRestrito={(d) => d.evolution_restrita}
      />,
    );
    await user.click(screen.getByRole("button", { name: /ver conteúdo restrito/i }));
    await waitFor(() =>
      expect(screen.getByText(/restrito ao profissional que registrou/i)).toBeInTheDocument(),
    );
  });
});
