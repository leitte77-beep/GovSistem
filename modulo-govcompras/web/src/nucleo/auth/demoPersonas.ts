import { api } from "@/nucleo/http/clienteHttp";
import { definirToken } from "./tokenStorage";

export interface Persona {
  email: string;
  nome: string;
  perfil: string;
  cargo: string | null;
}

interface TokenResposta {
  token: string;
}

// Senha de demonstração fixa (seção 128) — documentada no README, nunca
// usada em produção (a ponte de login só existe com ENABLE_DEV_LOGIN=true).
export const SENHA_DEMO = "Govcompras@123";

export async function trocarPersona(email: string, senha: string): Promise<void> {
  const resposta = await api.post<TokenResposta>("/auth/dev/login", { email, senha });
  definirToken(resposta.token);
}
