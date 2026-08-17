import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, ChevronDown, LogOut, Search, UserCircle2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useSessao } from "@/nucleo/auth/SessaoProvider";
import { api } from "@/nucleo/http/clienteHttp";
import type { Notificacao } from "@/nucleo/tipos";
import { SENHA_DEMO, trocarPersona, type Persona } from "@/nucleo/auth/demoPersonas";

export function Cabecalho() {
  const { usuario, sair } = useSessao();
  const navegar = useNavigate();
  const [menuAberto, setMenuAberto] = useState(false);
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [termoBusca, setTermoBusca] = useState("");
  const referenciaMenu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function aoClicarFora(evento: MouseEvent) {
      if (referenciaMenu.current && !referenciaMenu.current.contains(evento.target as Node)) {
        setMenuAberto(false);
      }
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  const { data: personas } = useQuery({
    queryKey: ["personas-demo"],
    queryFn: () => api.get<Persona[]>("/auth/dev/personas"),
    staleTime: Infinity,
    retry: false,
  });

  const { data: notificacoes } = useQuery({
    queryKey: ["notificacoes", "nao-lidas"],
    queryFn: () => api.get<Notificacao[]>("/notificacoes", { apenas_nao_lidas: true }),
    refetchInterval: 30_000,
  });

  function aoEnviarBusca(evento: React.FormEvent) {
    evento.preventDefault();
    if (termoBusca.trim()) {
      navegar(`/processos?busca=${encodeURIComponent(termoBusca.trim())}`);
      setBuscaAberta(false);
    }
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5">
      <form onSubmit={aoEnviarBusca} className="flex max-w-md flex-1 items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5">
        <Search className="size-4 shrink-0 text-slate-400" />
        <input
          value={termoBusca}
          onChange={(e) => setTermoBusca(e.target.value)}
          onFocus={() => setBuscaAberta(true)}
          onBlur={() => setBuscaAberta(false)}
          placeholder="Buscar processo, contrato, fornecedor... (Ctrl+K)"
          className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
        />
      </form>

      <div className="flex items-center gap-3">
        <button
          onClick={() => navegar("/notificacoes")}
          className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          aria-label="Notificações"
        >
          <Bell className="size-4" />
          {!!notificacoes?.length && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-semibold text-white">
              {notificacoes.length > 9 ? "9+" : notificacoes.length}
            </span>
          )}
        </button>

        <div className="relative" ref={referenciaMenu}>
          <button
            onClick={() => setMenuAberto((v) => !v)}
            className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-slate-100"
          >
            <UserCircle2 className="size-7 text-slate-400" />
            <div className="text-left leading-tight">
              <p className="text-xs font-medium text-slate-800">{usuario?.nome}</p>
              <p className="text-[11px] capitalize text-slate-400">{usuario?.perfil}</p>
            </div>
            <ChevronDown className="size-3.5 text-slate-400" />
          </button>

          {menuAberto && (
            <div className="absolute right-0 z-40 mt-1.5 w-72 rounded-xl border border-slate-200 bg-white py-2 shadow-lg">
              <p className="px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Modo demonstração — trocar de persona
              </p>
              <div className="max-h-64 overflow-y-auto">
                {personas?.map((persona) => (
                  <button
                    key={persona.email}
                    onClick={async () => {
                      setMenuAberto(false);
                      await trocarPersona(persona.email, SENHA_DEMO);
                      window.location.href = "/";
                    }}
                    disabled={persona.email === usuario?.email}
                    className="flex w-full flex-col items-start px-3 py-1.5 text-left text-sm hover:bg-slate-50 disabled:cursor-default disabled:bg-brand-50"
                  >
                    <span className="font-medium text-slate-800">{persona.nome}</span>
                    <span className="text-[11px] capitalize text-slate-400">{persona.perfil}</span>
                  </button>
                ))}
              </div>
              <div className="mt-1 border-t border-slate-100 pt-1">
                <button
                  onClick={sair}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  <LogOut className="size-3.5" /> Sair
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {buscaAberta && termoBusca && (
        <div className="absolute left-5 top-14 z-30 w-96 rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-500 shadow-lg">
          Pressione Enter para buscar "{termoBusca}" em processos, contratos e fornecedores.
        </div>
      )}
    </header>
  );
}
