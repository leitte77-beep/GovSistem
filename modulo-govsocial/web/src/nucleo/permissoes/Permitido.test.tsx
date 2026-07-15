import { render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { server } from "@/mock/server";
import { SessaoProvider } from "@/nucleo/auth/SessaoProvider";
import { Permitido } from "@/nucleo/permissoes/Permitido";
import { gravarAccessToken, limparAccessToken } from "@/nucleo/auth/tokenStorage";
import { tokenFalso } from "@/mock/tokenFalso";

// A sessão real é montada via MSW (/auth/me) + token no sessionStorage.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  limparAccessToken();
});
afterAll(() => server.close());

describe("<Permitido> — remove subárvore sem permissão (§1.1)", () => {
  beforeEach(() => {
    // O mock /auth/me devolve o perfil de VITE_MOCK_ROLE (default tecnico_superior).
    gravarAccessToken(tokenFalso("recepcao"));
  });

  it("recepção NÃO vê ação de conceder benefício (elemento ausente do DOM)", async () => {
    render(
      <SessaoProvider>
        <Permitido capacidade="beneficio.conceder">
          <button>Conceder benefício</button>
        </Permitido>
        <span>âncora</span>
      </SessaoProvider>,
    );

    await waitFor(() => expect(screen.getByText("âncora")).toBeInTheDocument());
    expect(screen.queryByText("Conceder benefício")).not.toBeInTheDocument();
  });

  it("recepção VÊ ação de cadastrar família", async () => {
    render(
      <SessaoProvider>
        <Permitido capacidade="familia.cadastrar">
          <button>Cadastrar nova família</button>
        </Permitido>
      </SessaoProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText("Cadastrar nova família")).toBeInTheDocument(),
    );
  });
});
