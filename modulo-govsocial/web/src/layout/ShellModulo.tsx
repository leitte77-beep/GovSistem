import { Outlet } from "react-router-dom";
import { Cabecalho } from "./Cabecalho";
import { Sidebar } from "./Sidebar";
import { BarraOffline } from "@/ui/BarraOffline";
import { useSincronizacao } from "@/nucleo/offline/SincronizacaoProvider";

/**
 * Shell Premium do módulo: sidebar fixa + cabeçalho fixo + conteúdo principal.
 */
export function ShellModulo() {
  const { pendentes } = useSincronizacao();
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <a href="#conteudo" className="pular-link apenas-leitor">
        Pular para o conteúdo
      </a>
      <Sidebar />
      <Cabecalho />
      <BarraOffline pendentes={pendentes} />
      <main id="conteudo" className="ml-[260px] mt-20 p-margin-desktop min-h-[calc(100vh-80px)]" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
