// Token em sessionStorage — some ao fechar a aba, não persiste em disco.
const CHAVE = "govcompras.token";

export function obterToken(): string | null {
  return sessionStorage.getItem(CHAVE);
}

export function definirToken(token: string): void {
  sessionStorage.setItem(CHAVE, token);
}

export function limparToken(): void {
  sessionStorage.removeItem(CHAVE);
}
