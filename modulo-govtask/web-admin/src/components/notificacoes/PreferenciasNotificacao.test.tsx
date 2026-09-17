import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";
import { PreferenciasNotificacao } from "./PreferenciasNotificacao";

vi.mock("@/lib/api", () => ({
  api: {
    preferenciasNotificacao: vi.fn(),
    atualizarPreferenciasNotificacao: vi.fn(),
  },
}));

const PREFERENCIA = {
  email_ativo: false,
  tipos_email: [] as string[],
  tipos_disponiveis: ["TAREFA_ATRIBUIDA", "PRAZO_VENCIDO"],
  tipos_obrigatorios: ["PRAZO_VENCIDO"],
  canal_configurado: true,
};

describe("PreferenciasNotificacao", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.preferenciasNotificacao).mockResolvedValue(PREFERENCIA);
    vi.mocked(api.atualizarPreferenciasNotificacao).mockResolvedValue({
      ...PREFERENCIA,
      email_ativo: true,
    });
  });

  it("mostra o canal e envia a preferência ao salvar", async () => {
    render(<PreferenciasNotificacao />);

    const email = await screen.findByLabelText(/Receber também por e-mail/i);
    expect(email).not.toBeChecked();

    await userEvent.click(email);
    expect(await screen.findByText(/obrigatório/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Salvar preferências/i }));
    await waitFor(() =>
      expect(api.atualizarPreferenciasNotificacao).toHaveBeenCalledWith({
        email_ativo: true,
        tipos_email: [],
      })
    );
  });

  it("tipo obrigatório aparece marcado e travado", async () => {
    vi.mocked(api.preferenciasNotificacao).mockResolvedValue({ ...PREFERENCIA, email_ativo: true });
    render(<PreferenciasNotificacao />);

    const obrigatorio = await screen.findByLabelText(/Prazo vencido/i);
    expect(obrigatorio).toBeChecked();
    expect(obrigatorio).toBeDisabled();
  });
});
