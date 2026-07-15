import { useEffect, useState } from "react";

/**
 * Estado de conexão para a <BarraOffline> e para gatilhos de sincronização.
 * A fila de sincronização real (rascunhos, frequência) entra nas fases 4/6;
 * aqui expomos apenas online/offline e um contador de pendências plugável.
 */
export function useEstadoConexao(): { online: boolean } {
  const [online, setOnline] = useState<boolean>(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const ligar = () => setOnline(true);
    const desligar = () => setOnline(false);
    window.addEventListener("online", ligar);
    window.addEventListener("offline", desligar);
    return () => {
      window.removeEventListener("online", ligar);
      window.removeEventListener("offline", desligar);
    };
  }, []);

  return { online };
}
