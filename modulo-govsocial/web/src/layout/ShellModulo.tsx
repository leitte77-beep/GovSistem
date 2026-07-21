import { Outlet } from "react-router-dom";
import { Cabecalho } from "./Cabecalho";
import { Sidebar } from "./Sidebar";
import { BarraOffline } from "@/ui/BarraOffline";
import { ChatButton } from "@/ui/ChatButton";
import { ChatDrawer } from "@/ui/ChatDrawer";
import { useChat, type SalaChat } from "@/nucleo/api/servicosFase2";
import { useSincronizacao } from "@/nucleo/offline/SincronizacaoProvider";
import { useSessao } from "@/nucleo/auth/SessaoProvider";
import { useState, useMemo } from "react";

const SALAS: SalaChat[] = [{ id: "geral", nome: "Geral" }];

/**
 * Shell Premium do módulo: sidebar fixa + cabeçalho fixo + conteúdo principal.
 */
export function ShellModulo() {
  const { pendentes } = useSincronizacao();
  const { usuario, tenantId } = useSessao();

  const {
    conectado,
    mensagens,
    digitando,
    online,
    aberto,
    naoLidas,
    enviarMensagem,
    enviarDigitando,
    abrirChat,
    fecharChat,
  } = useChat(tenantId, usuario?.id ?? null, usuario?.name ?? null);

  const [salaAtiva, setSalaAtiva] = useState("geral");

  const mensagensFiltradas = useMemo(
    () => mensagens.filter(() => salaAtiva === "geral"),
    [mensagens, salaAtiva],
  );

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

      {usuario && tenantId && (
        <>
          <ChatButton naoLidas={naoLidas} aoClicar={abrirChat} />
          <ChatDrawer
            aberto={aberto}
            aoFechar={fecharChat}
            conectado={conectado}
            mensagens={mensagensFiltradas}
            digitando={digitando}
            online={online}
            userId={usuario.id}
            salas={SALAS}
            salaAtiva={salaAtiva}
            aoMudarSala={setSalaAtiva}
            aoEnviar={enviarMensagem}
            aoDigitar={enviarDigitando}
          />
        </>
      )}
    </div>
  );
}
