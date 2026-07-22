import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./estilos/tokens.css";
import "./estilos/base.css";
import { App } from "./App";
import {
  bootstrapTokenDaShell,
  gravarAccessToken,
  lerAccessToken,
} from "./nucleo/auth/tokenStorage";

/**
 * Bootstrap do módulo.
 * - Captura o token da shell (?token=) IMEDIATAMENTE, antes de qualquer
 *   render/redirecionamento de rota (senão o React Router limpa a query
 *   string ao redirecionar "/" → "/inicio" e o token se perde).
 * - Quando VITE_API_MOCK=1: inicia o MSW e injeta um token falso com o perfil
 *   de VITE_MOCK_ROLE (simula a shell injetando o JWT).
 * - Em produção/dev com API real: o token vem via ?token= e o SessaoProvider
 *   cuida do resto.
 */
async function iniciar() {
  // Deve rodar antes do render (captura o ?token= e limpa a URL).
  bootstrapTokenDaShell();

  if (import.meta.env.VITE_API_MOCK === "1") {
    const { worker } = await import("./mock/browser");
    const { papelDoAmbiente, tokenFalso } = await import("./mock/tokenFalso");
    await worker.start({
      onUnhandledRequest: "bypass",
      serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
    });
    if (!lerAccessToken()) {
      gravarAccessToken(tokenFalso(papelDoAmbiente()));
    }
  }

  const raiz = document.getElementById("root");
  if (!raiz) throw new Error("Elemento #root não encontrado");
  createRoot(raiz).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void iniciar().catch((erro) => {
  console.error("Falha ao iniciar aplicação:", erro);
  const raiz = document.getElementById("root");
  if (raiz) {
    raiz.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;color:#555">
        <p>Não foi possível iniciar o sistema. Recarregue a página ou entre em contato com o suporte.</p>
      </div>`;
  }
});
