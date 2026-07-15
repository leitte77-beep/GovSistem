import { useRef, useState } from "react";
import { useSessao } from "@/nucleo/auth/SessaoProvider";
import { limparAccessToken } from "@/nucleo/auth/tokenStorage";
import { useContagemNotificacoes } from "@/nucleo/api/servicosFase2";
import { SeletorUnidade } from "./SeletorUnidade";
import { BuscaGlobal } from "./BuscaGlobal";
import { PainelNotificacoes } from "./PainelNotificacoes";

const PLATAFORMA_URL =
  import.meta.env.VITE_PLATFORM_URL || "https://admin.govsistem.com.br/";

export function Cabecalho() {
  const { usuario, papeis } = useSessao();
  const buscaRef = useRef<HTMLInputElement>(null);
  const nomeExibicao = usuario?.name ?? "—";

  const { data: contagem } = useContagemNotificacoes();
  const totalNaoLidas = contagem?.total ?? 0;

  const [painelAberto, setPainelAberto] = useState(false);

  const papelPrincipal =
    papeis.includes("gestor_municipal")
      ? "Gestor Municipal"
      : papeis.includes("coordenador_unidade")
        ? "Coordenador"
        : papeis.includes("tecnico_superior") || papeis.includes("tecnico_medio")
          ? "Técnico"
          : papeis.includes("vigilancia")
            ? "Vigilância"
            : papeis.includes("recepcao")
              ? "Recepção"
              : papeis.includes("ADMIN")
                ? "Administrador"
                : "Usuário";

  return (
    <header className="nao-imprimir fixed top-0 right-0 left-[260px] h-20 bg-white/80 backdrop-blur-md flex justify-between items-center px-lg z-40 border-b border-surface-container-highest/20">
      <div className="flex items-center flex-1 max-w-3xl gap-4">
        <div className="flex-1 max-w-2xl">
          <BuscaGlobal inputRef={buscaRef} />
        </div>
        <SeletorUnidade />
      </div>

      <div className="flex items-center gap-6 ml-md">
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setPainelAberto(!painelAberto)}
              className={`relative w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                painelAberto
                  ? "bg-primary/10 text-primary"
                  : "hover:bg-surface-container-low text-secondary"
              }`}
              aria-label={`Notificações${totalNaoLidas > 0 ? ` — ${totalNaoLidas} não lidas` : ""}`}
            >
              <span className="material-symbols-outlined !text-[24px]">
                {totalNaoLidas > 0 ? "notifications_active" : "notifications"}
              </span>
              {totalNaoLidas > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-error text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 border-2 border-white">
                  {totalNaoLidas > 99 ? "99+" : totalNaoLidas}
                </span>
              )}
            </button>
            <PainelNotificacoes
              aberto={painelAberto}
              aoFechar={() => setPainelAberto(false)}
            />
          </div>
        </div>

        <div className="h-8 w-px bg-surface-container-highest mx-1" />

        <div className="flex items-center gap-3 pl-2">
          <div className="text-right hidden sm:block">
            <p className="font-label-md text-label-md text-ink font-bold">{nomeExibicao}</p>
            <p className="text-[10px] text-primary font-bold uppercase tracking-widest">{papelPrincipal}</p>
          </div>
          <div className="w-11 h-11 rounded-2xl border-2 border-primary-container overflow-hidden shadow-sm bg-primary-container flex items-center justify-center">
            <span className="material-symbols-outlined text-on-primary-container !text-[24px]">
              person
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              limparAccessToken();
              window.location.href = PLATAFORMA_URL;
            }}
            className="w-10 h-10 rounded-xl hover:bg-error/5 flex items-center justify-center text-outline hover:text-error transition-all"
            aria-label="Sair e voltar à plataforma"
            title="Sair"
          >
            <span className="material-symbols-outlined">logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}
