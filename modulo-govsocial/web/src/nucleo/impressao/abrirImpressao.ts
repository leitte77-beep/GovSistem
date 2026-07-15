import { criarHandoffToken } from "@/nucleo/auth/tokenStorage";

// Mesmo prefixo de rota do BrowserRouter (§ App): "/assistencia-social" na
// shell, "/" no subdomínio próprio.
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/**
 * Abre uma rota /imprimir em nova aba já autenticada.
 *
 * A aba nova nasce sem opener e, por isso, com sessionStorage vazio — sem o
 * handoff ela cairia no "sua sessão não está ativa". O nonce de uso único vai
 * na URL e é trocado pelo token no bootstrap da aba (§ tokenStorage).
 *
 * @param caminho trecho após /imprimir, ex.: `guia/${id}`.
 */
export function abrirImpressao(caminho: string): void {
  const nonce = criarHandoffToken();
  const url = `${BASE}/imprimir/${caminho}${nonce ? `?h=${nonce}` : ""}`;
  window.open(url, "_blank", "noopener");
}
