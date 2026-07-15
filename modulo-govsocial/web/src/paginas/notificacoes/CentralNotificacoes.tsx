/** Central de Notificações — com ícones por tipo e badges coloridos */
import { Bell, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  useNotificacoes,
  servicoNotificacoes,
  TIPO_NOTIFICACAO_ICONE,
  TIPO_NOTIFICACAO_COR,
  type NotificacaoOut,
} from "@/nucleo/api/servicosFase2";
import { Skeleton } from "@/ui/Skeleton";
import { useQueryClient } from "@tanstack/react-query";

function iconeTipo(tipo: string): string {
  return TIPO_NOTIFICACAO_ICONE[tipo as keyof typeof TIPO_NOTIFICACAO_ICONE] ?? "circle_notifications";
}

function corTipo(tipo: string): string {
  return TIPO_NOTIFICACAO_COR[tipo as keyof typeof TIPO_NOTIFICACAO_COR] ?? "text-slate-600 bg-slate-50";
}

function labelTipo(tipo: string): string {
  const map: Record<string, string> = {
    ENCAMINHAMENTO: "Encaminhamento",
    AGENDA: "Agenda",
    BENEFICIO: "Benefício",
    PRAZO: "Prazo",
    ALERTA: "Alerta",
    SISTEMA: "Sistema",
  };
  return map[tipo] ?? tipo;
}

export default function CentralNotificacoes() {
  const { data, isLoading } = useNotificacoes();
  const qc = useQueryClient();
  const navegar = useNavigate();

  if (isLoading) return <Skeleton variante="cartao" />;

  const marcarTodas = async () => {
    await servicoNotificacoes.marcarTodas();
    qc.invalidateQueries({ queryKey: ["notificacoes"] });
    qc.invalidateQueries({ queryKey: ["notificacoes", "count"] });
  };

  const marcarLida = async (id: string) => {
    await servicoNotificacoes.marcarLida(id);
    qc.invalidateQueries({ queryKey: ["notificacoes"] });
    qc.invalidateQueries({ queryKey: ["notificacoes", "count"] });
  };

  const clicarNotificacao = (n: NotificacaoOut) => {
    if (!n.lida) marcarLida(n.id);
    if (n.link) navegar(n.link);
  };

  const naoLidas = data?.filter((n) => !n.lida).length ?? 0;

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          Notificações
          {naoLidas > 0 && (
            <span className="text-xs font-medium text-error bg-error/10 rounded-full px-2 py-0.5">
              {naoLidas} não lidas
            </span>
          )}
        </h2>
        {naoLidas > 0 && (
          <button
            onClick={marcarTodas}
            className="text-sm text-primary font-medium hover:underline flex items-center gap-1"
          >
            <Check className="w-4 h-4" /> Marcar todas como lidas
          </button>
        )}
      </div>

      {!data || data.length === 0 ? (
        <div className="text-center text-secondary py-16">
          <span className="material-symbols-outlined text-5xl text-outline/30 mb-3 block">
            notifications_off
          </span>
          <p className="text-body-md">Nenhuma notificação no momento</p>
          <p className="text-body-sm text-outline mt-1">
            Você será notificado sobre encaminhamentos, prazos e atualizações do sistema.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {data.map((n) => {
            const cor = corTipo(n.tipo);
            const icone = iconeTipo(n.tipo);
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => clicarNotificacao(n)}
                className={`w-full text-left p-4 rounded-xl border transition-all flex gap-3 items-start ${
                  n.lida
                    ? "bg-white border-surface-container-highest hover:bg-surface-container-low"
                    : "bg-primary/5 border-primary/20 hover:bg-primary/10"
                } ${n.link ? "cursor-pointer" : "cursor-default"}`}
              >
                <span
                  className={`material-symbols-outlined w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-[20px] ${cor}`}
                >
                  {icone}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-xs font-medium px-1.5 py-px rounded ${cor}`}>
                      {labelTipo(n.tipo)}
                    </span>
                    {!n.lida && (
                      <span className="w-2 h-2 rounded-full bg-error shrink-0" />
                    )}
                  </div>
                  <div className="font-medium text-sm text-ink">{n.titulo}</div>
                  {n.mensagem && (
                    <div className="text-xs text-secondary mt-1 line-clamp-2">
                      {n.mensagem}
                    </div>
                  )}
                  <div className="text-[11px] text-outline mt-2">
                    {new Date(n.created_at).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                {n.link && (
                  <span className="material-symbols-outlined text-outline text-[18px] shrink-0 mt-1">
                    arrow_forward_ios
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
