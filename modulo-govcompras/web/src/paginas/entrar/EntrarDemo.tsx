import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ShoppingCart, Loader2 } from "lucide-react";
import { api } from "@/nucleo/http/clienteHttp";
import { useSessao } from "@/nucleo/auth/SessaoProvider";
import { SENHA_DEMO, type Persona } from "@/nucleo/auth/demoPersonas";
import { EstadoErro } from "@/ui";

interface TokenResposta {
  token: string;
}

export function EntrarDemo() {
  const navegar = useNavigate();
  const { entrarComToken } = useSessao();
  const [entrando, setEntrando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const { data: personas, isLoading } = useQuery({
    queryKey: ["personas-demo"],
    queryFn: () => api.get<Persona[]>("/auth/dev/personas"),
    retry: false,
  });

  async function entrar(email: string) {
    setEntrando(email);
    setErro(null);
    try {
      const resposta = await api.post<TokenResposta>("/auth/dev/login", { email, senha: SENHA_DEMO });
      await entrarComToken(resposta.token);
      navegar("/");
    } catch {
      setErro("Não foi possível entrar com esta persona. Verifique se o backend está no ar e com ENABLE_DEV_LOGIN=true.");
      setEntrando(null);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/20">
            <ShoppingCart className="size-7" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">GovCompras</h1>
          <p className="text-sm text-slate-500">Gestão Integrada de Compras, Licitações e Contratos</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-1 text-sm font-semibold text-slate-800">Modo de demonstração</p>
          <p className="mb-4 text-xs text-slate-500">
            Escolha uma persona para explorar a POC. Em produção o acesso viria do login único da
            plataforma GovSistem — esta tela existe só para navegar a demonstração de forma independente.
          </p>

          {erro && (
            <div className="mb-3">
              <EstadoErro mensagem={erro} />
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="size-5 animate-spin text-slate-400" />
            </div>
          ) : !personas?.length ? (
            <EstadoErro mensagem="Nenhuma persona de demonstração disponível. O backend pode estar com ENABLE_DEV_LOGIN=false." />
          ) : (
            <div className="space-y-2">
              {personas.map((persona) => (
                <button
                  key={persona.email}
                  onClick={() => entrar(persona.email)}
                  disabled={entrando !== null}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/50 disabled:opacity-60"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">{persona.nome}</p>
                    <p className="text-xs text-slate-500">{persona.cargo ?? persona.perfil}</p>
                  </div>
                  {entrando === persona.email ? (
                    <Loader2 className="size-4 animate-spin text-brand-600" />
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] capitalize text-slate-500">
                      {persona.perfil}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="mt-4 text-center text-[11px] text-slate-400">
          Senha de demonstração: <code className="rounded bg-slate-100 px-1 py-0.5">{SENHA_DEMO}</code>
        </p>
      </div>
    </div>
  );
}
