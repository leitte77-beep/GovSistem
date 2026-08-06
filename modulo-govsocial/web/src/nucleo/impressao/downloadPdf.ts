import { lerAccessToken } from "@/nucleo/auth/tokenStorage";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api/govsocial/v1";

/**
 * Faz download de um PDF gerado pelo backend.
 *
 * Substitui o fluxo antigo de abrirImpressao + window.print() por
 * download direto do arquivo PDF, que funciona mesmo com bloqueador
 * de popup e gera arquivo físico para o usuário.
 *
 * @param caminho trecho após a base, ex.: `/reports/encaminhamentos/${id}/guia`
 * @param nomeArquivo nome sugerido para o download, ex.: `oficio_001_2024.pdf`
 */
export async function downloadPdf(caminho: string, nomeArquivo?: string): Promise<void> {
  const token = lerAccessToken();
  if (!token) {
    throw new Error("Sessão não ativa. Faça login novamente.");
  }

  const url = `${API_BASE}${caminho}`;
  const resposta = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!resposta.ok) {
    const texto = await resposta.text().catch(() => "");
    throw new Error(texto || `Erro ao gerar documento (${resposta.status})`);
  }

  const blob = await resposta.blob();
  const objectUrl = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = nomeArquivo ?? "documento.pdf";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Pequeno delay para garantir que o navegador iniciou o download
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
