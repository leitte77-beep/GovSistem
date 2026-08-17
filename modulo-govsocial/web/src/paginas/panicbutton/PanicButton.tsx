import { useCallback, useRef, useState } from "react";
import { AlertTriangle, Loader2, UserSearch } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";

import { servicoPanicButton } from "@/nucleo/api/panicButton";

interface PanicButtonProps {
  personId?: string;
  familyId?: string;
  lat?: number;
  lng?: number;
  address?: string;
  onActivated?: () => void;
}

export default function PanicButton(props?: PanicButtonProps) {
  const [searchParams] = useSearchParams();
  const personId = props?.personId ?? searchParams.get("person_id") ?? "";
  const familyId = props?.familyId ?? searchParams.get("family_id") ?? undefined;
  const lat = props?.lat ?? (searchParams.get("lat") ? Number(searchParams.get("lat")) : undefined);
  const lng = props?.lng ?? (searchParams.get("lng") ? Number(searchParams.get("lng")) : undefined);
  const address = props?.address ?? searchParams.get("address") ?? undefined;
  const onActivated = props?.onActivated;
  const [pressionando, setPressionando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      servicoPanicButton.ativar({
        person_id: personId,
        family_id: familyId,
        lat,
        lng,
        address,
      }),
    onSuccess: () => {
      onActivated?.();
    },
  });

  const iniciarPressionar = useCallback(() => {
    if (mutation.isPending) return;
    setPressionando(true);
    setProgresso(0);

    const duracao = 3000;
    const intervalo = 50;
    const incremento = (intervalo / duracao) * 100;

    timerRef.current = setInterval(() => {
      setProgresso((prev) => {
        const next = prev + incremento;
        if (next >= 100) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          return 100;
        }
        return next;
      });
    }, intervalo);

    holdRef.current = setTimeout(() => {
      setPressionando(false);
      setProgresso(0);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      mutation.mutate();
    }, duracao);
  }, [mutation]);

  const cancelarPressionar = useCallback(() => {
    setPressionando(false);
    setProgresso(0);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (holdRef.current) {
      clearTimeout(holdRef.current);
      holdRef.current = null;
    }
  }, []);

  const handleMouseDown = () => iniciarPressionar();
  const handleMouseUp = () => cancelarPressionar();
  const handleMouseLeave = () => cancelarPressionar();
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    iniciarPressionar();
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    cancelarPressionar();
  };

  if (!personId) {
    return (
      <div className="flex flex-col items-center gap-4 p-6">
        <UserSearch className="h-12 w-12 text-ink-soft" />
        <p className="text-sm text-ink-soft">
          Selecione uma pessoa para ativar o botão do pânico.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        type="button"
        className={`relative flex h-48 w-48 select-none items-center justify-center rounded-full border-4 border-danger/30 bg-danger shadow-lg shadow-danger/40 transition-all active:scale-95 ${
          pressionando
            ? "scale-105 border-danger bg-danger/90 shadow-xl shadow-danger/50"
            : ""
        } ${mutation.isPending ? "opacity-70" : ""}`}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        disabled={mutation.isPending}
        aria-label="Botão do Pânico — pressione por 3 segundos para ativar"
      >
        {pressionando && (
          <svg
            className="absolute inset-0 h-full w-full -rotate-90"
            viewBox="0 0 100 100"
          >
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="white"
              strokeWidth="6"
              strokeDasharray={`${(progresso / 100) * 283} 283`}
              strokeLinecap="round"
              className="opacity-60"
            />
          </svg>
        )}

        {mutation.isPending ? (
          <div className="flex flex-col items-center gap-2 text-white">
            <Loader2 className="h-10 w-10 animate-spin" />
            <span className="text-xs font-bold">Enviando alerta...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 text-white">
            <AlertTriangle className="h-12 w-12" />
            <span className="text-sm font-extrabold uppercase tracking-widest">
              PÂNICO
            </span>
            <span className="text-[10px] opacity-70">
              Segure por 3 segundos
            </span>
          </div>
        )}
      </button>

      {mutation.isSuccess && (
        <div className="rounded border border-success/30 bg-success/10 px-4 py-2 text-center text-sm font-medium text-success">
          Alerta enviado com sucesso! As autoridades foram notificadas.
        </div>
      )}

      {mutation.isError && (
        <div className="rounded border border-danger/30 bg-danger/10 px-4 py-2 text-center text-sm font-medium text-danger">
          Erro ao enviar alerta. Tente novamente ou ligue para 190.
        </div>
      )}

      <p className="max-w-xs text-center text-xs text-ink-soft">
        Em caso de emergência, pressione o botão por 3 segundos. Sua localização
        será enviada automaticamente para a Guarda Municipal e Polícia Militar.
      </p>
    </div>
  );
}
