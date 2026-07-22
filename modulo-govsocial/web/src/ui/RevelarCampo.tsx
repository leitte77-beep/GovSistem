import { useCallback, useEffect, useRef, useState } from "react";
import { usePermissao } from "@/nucleo/permissoes/usePermissao";
import { logPiiReveal } from "@/nucleo/api/auditoria";
import { textos } from "@/i18n/textos";

type RevelarCampoProps = {
  valor: string;
  valorCompleto?: string;
  campo: "cpf" | "nis";
  entityId: string;
  entityType: "familia" | "pessoa";
};

const DURACAO_REVELADO = 10_000;

export function RevelarCampo({
  valor,
  valorCompleto,
  campo,
  entityId,
  entityType,
}: RevelarCampoProps) {
  const podeRevelar = usePermissao("pii:reveal");
  const [visivel, setVisivel] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mostrar = useCallback(() => {
    logPiiReveal({ campo, entityId, entityType });
    setVisivel(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisivel(false), DURACAO_REVELADO);
  }, [campo, entityId, entityType]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const temValorCompleto = valorCompleto && valorCompleto.trim().length > 0;
  const podeMostrar = temValorCompleto && podeRevelar;

  return (
    <span className="inline-flex items-center">
      <span className="fonte-mono text-xs tabular-nums">
        {visivel && temValorCompleto ? valorCompleto : valor}
      </span>
      {podeMostrar && !visivel && (
        <button
          type="button"
          className="inline-flex items-center ml-1 text-ink-soft/40 hover:text-primary transition-colors"
          aria-label={textos.sigilo.mostrarCampo.replace("{campo}", campo.toUpperCase())}
          onClick={mostrar}
        >
          👁
        </button>
      )}
    </span>
  );
}
