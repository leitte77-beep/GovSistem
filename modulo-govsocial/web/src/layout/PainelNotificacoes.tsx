/** Painel dropdown de notificações — abre no canto ao clicar no sino */
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  useNotificacoes,
  servicoNotificacoes,
  TIPO_NOTIFICACAO_ICONE,
  TIPO_NOTIFICACAO_COR,
  type NotificacaoOut,
} from "@/nucleo/api/servicosFase2";
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

type PainelNotificacoesProps = {
  aberto: boolean;
  aoFechar: () => void;
};

export function PainelNotificacoes({ aberto, aoFechar }: PainelNotificacoesProps) {
  const { data } = useNotificacoes();
  const qc = useQueryClient();
  const navegar = useNavigate();
  const painelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;

    function cliqueFora(e: MouseEvent) {
      if (painelRef.current && !painelRef.current.contains(e.target as Node)) {
        aoFechar();
      }
    }

    function teclaEsc(e: KeyboardEvent) {
      if (e.key === "Escape") aoFechar();
    }

    document.addEventListener("mousedown", cliqueFora);
    document.addEventListener("keydown", teclaEsc);
    return () => {
      document.removeEventListener("mousedown", cliqueFora);
      document.removeEventListener("keydown", teclaEsc);
    };
  }, [aberto, aoFechar]);

  const marcarLida = async (id: string) => {
    await servicoNotificacoes.marcarLida(id);
    qc.invalidateQueries({ queryKey: ["notificacoes"] });
    qc.invalidateQueries({ queryKey: ["notificacoes", "count"] });
  };

  const marcarTodas = async () => {
    await servicoNotificacoes.marcarTodas();
    qc.invalidateQueries({ queryKey: ["notificacoes"] });
    qc.invalidateQueries({ queryKey: ["notificacoes", "count"] });
  };

  const clicarNotificacao = (n: NotificacaoOut) => {
    if (!n.lida && !n.role_alvo) marcarLida(n.id);
    if (n.link) navegar(n.link);
    aoFechar();
  };

  const notificacoes = data?.slice(0, 8) ?? [];
  const naoLidas = data?.filter((n) => !n.lida).length ?? 0;

  if (!aberto) return null;

  return (
    <div
      ref={painelRef}
      className="absolute right-0 top-full mt-2 w-[420px] max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-xl border border-surface-container-highest/30 z-50 overflow-hidden"
    >
      <div className="flex items-center justify-between px-5 py-3 border-b border-surface-container-highest/20">
        <h3 className="font-semibold text-sm text-ink flex items-center gap-2">
          Notificações
          {naoLidas > 0 && (
            <span className="text-[11px] font-medium text-error bg-error/10 rounded-full px-1.5 py-px">
              {naoLidas}
            </span>
          )}
        </h3>
        <div className="flex items-center gap-1">
          {naoLidas > 0 && (
            <button
              onClick={marcarTodas}
              className="text-[11px] text-primary font-medium hover:underline px-2"
            >
              Marcar todas
            </button>
          )}
          <button
            onClick={() => { navegar("/notificacoes"); aoFechar(); }}
            className="text-[11px] text-primary font-medium hover:underline px-2"
          >
            Ver todas
          </button>
        </div>
      </div>

      <div className="max-h-[480px] overflow-y-auto">
        {notificacoes.length === 0 ? (
          <div className="py-12 text-center">
            <span className="material-symbols-outlined text-4xl text-outline/20 mb-2 block">
              notifications_off
            </span>
            <p className="text-sm text-secondary">Nenhuma notificação</p>
          </div>
        ) : (
          notificacoes.map((n) => {
            const cor = corTipo(n.tipo);
            const icone = iconeTipo(n.tipo);
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => clicarNotificacao(n)}
                className={`w-full text-left px-5 py-3 flex gap-3 items-start transition-colors border-b border-surface-container-highest/10 last:border-b-0 ${
                  n.lida
                    ? "hover:bg-surface-container-low/50"
                    : "bg-primary/[0.04] hover:bg-primary/[0.08]"
                }`}
              >
                <span
                  className={`material-symbols-outlined w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-[18px] ${cor}`}
                >
                  {icone}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[10px] font-medium px-1.5 py-px rounded ${cor}`}>
                      {labelTipo(n.tipo)}
                    </span>
                    {!n.lida && (
                      <span className="w-1.5 h-1.5 rounded-full bg-error shrink-0" />
                    )}
                  </div>
                  <p className="text-xs font-medium text-ink line-clamp-1">{n.titulo}</p>
                  {n.mensagem && (
                    <p className="text-[11px] text-secondary mt-0.5 line-clamp-2">
                      {n.mensagem}
                    </p>
                  )}
                  <p className="text-[10px] text-outline mt-1.5">
                    {new Date(n.created_at).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
