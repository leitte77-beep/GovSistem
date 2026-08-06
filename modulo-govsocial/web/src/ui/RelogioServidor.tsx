import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { http } from "@/nucleo/http/clienteHttp";

export function RelogioServidor() {
  const [hora, setHora] = useState<string>("--:--");
  const [data, setData] = useState<string>("");

  useEffect(() => {
    let intervalo: ReturnType<typeof setInterval>;
    let deslocamento = 0;

    async function sincronizar() {
      try {
        const resp = await http.get<{ iso: string }>("/auth/server-time");
        const servidor = new Date(resp.iso);
        deslocamento = servidor.getTime() - Date.now();
        atualizar(deslocamento);
      } catch {
        atualizar(0);
      }
    }

    function atualizar(offset: number) {
      const agora = new Date(Date.now() + offset);
      setHora(
        agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      );
      setData(
        agora.toLocaleDateString("pt-BR", {
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      );
    }

    sincronizar();
    intervalo = setInterval(() => atualizar(deslocamento), 30_000);

    return () => clearInterval(intervalo);
  }, []);

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs tabular-nums opacity-80"
      title={`Data e hora do servidor: ${data} ${hora}`}
    >
      <Clock aria-hidden className="h-3.5 w-3.5" />
      <span className="apenas-leitor">Servidor: </span>
      {data} {hora}
    </span>
  );
}
