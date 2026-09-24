"use client";

import clsx from "clsx";
import {
  AlertTriangle,
  Building2,
  Clock,
  Hourglass,
  OctagonAlert,
  PauseCircle,
} from "lucide-react";

import {
  ROTULO_MOTIVO_PARADA,
  ROTULO_SITUACAO,
  haDias,
  ROTULO_TIPO,
  situacaoDoPrazo,
} from "@/lib/formato";
import { useNomeSetor } from "@/lib/setores";

const CORES_SITUACAO: Record<string, string> = {
  COM_ASSESSOR: "bg-brand-50 text-brand-700",
  EM_SETOR: "bg-brass-50 text-brass-700",
  AGUARDANDO_TERCEIRO: "bg-estado-externo/10 text-estado-externo",
  CONCLUIDO: "bg-estado-concluido/10 text-estado-concluido",
  CANCELADO: "bg-ink/[.06] text-ink-muted",
};

const PONTO_SITUACAO: Record<string, string> = {
  COM_ASSESSOR: "bg-brand",
  EM_SETOR: "bg-estado-andamento",
  AGUARDANDO_TERCEIRO: "bg-estado-externo",
  CONCLUIDO: "bg-estado-concluido",
  CANCELADO: "bg-estado-cancelado",
};

export function EtiquetaSituacao({ situacao }: { situacao: string }) {
  return (
    <span
      className={clsx(
        "etiqueta",
        CORES_SITUACAO[situacao] ?? CORES_SITUACAO.CANCELADO
      )}
    >
      <span
        className={clsx(
          "h-1.5 w-1.5 rounded-full",
          PONTO_SITUACAO[situacao] ?? PONTO_SITUACAO.CANCELADO
        )}
        aria-hidden
      />
      {ROTULO_SITUACAO[situacao] ?? situacao}
    </span>
  );
}

export function EtiquetaTipo({ tipo }: { tipo: string }) {
  return (
    <span className="etiqueta border border-line bg-paper text-ink-muted">
      {ROTULO_TIPO[tipo] ?? tipo}
    </span>
  );
}

export function EtiquetaSetor({ setor }: { setor: string | null }) {
  const nomeSetor = useNomeSetor();
  if (!setor) return null;
  return (
    <span className="etiqueta bg-ink/[.05] text-ink-muted">
      <Building2 size={12} aria-hidden />
      {nomeSetor(setor)}
    </span>
  );
}

const CORES_PRAZO = {
  atrasado: "bg-estado-atrasado/10 text-estado-atrasado",
  hoje: "bg-brass-50 text-brass-700",
  proximo: "bg-brass-50 text-brass-700",
  tranquilo: "bg-ink/[.05] text-ink-muted",
  sem: "bg-ink/[.04] text-ink-faint",
};

/**
 * A saúde do pedido em uma etiqueta, com ícone e texto — nunca só cor.
 * Pedido normal não mostra nada: silêncio é o estado saudável.
 */
export function EtiquetaSaude({
  saude,
  motivo,
}: {
  saude: string;
  motivo?: string;
}) {
  if (saude === "NORMAL") return null;
  const critica = saude === "CRITICA";
  // O motivo completo fica no título (tooltip) e no painel do pedido: aqui é
  // uma etiqueta, não um parágrafo — senão o card vira uma parede de texto.
  return (
    <span
      className={clsx(
        "etiqueta",
        critica
          ? "bg-estado-atrasado/10 text-estado-atrasado"
          : "bg-brass-50 text-brass-700"
      )}
      title={motivo || undefined}
    >
      {critica ? (
        <OctagonAlert size={12} aria-hidden />
      ) : (
        <AlertTriangle size={12} aria-hidden />
      )}
      {critica ? "Crítica" : "Atenção"}
    </span>
  );
}

/** O prazo em palavras: "Atrasado há 28 dias" diz mais que uma data. */
export function EtiquetaPrazo({
  prazo,
  diasDeAtraso,
}: {
  prazo: string | null;
  diasDeAtraso: number;
}) {
  const { texto, tom } = situacaoDoPrazo(prazo, diasDeAtraso);
  return (
    <span className={clsx("etiqueta", CORES_PRAZO[tom])}>
      <Clock size={12} aria-hidden />
      {texto}
    </span>
  );
}

/** Há quanto tempo está onde está. Fica vermelho a partir do limite da prefeitura. */
export function EtiquetaParado({
  dias,
  limite = 15,
  compacta,
}: {
  dias: number;
  limite?: number;
  compacta?: boolean;
}) {
  const critico = dias >= limite;
  const atencao = !critico && dias >= Math.ceil(limite / 2);
  return (
    <span
      className={clsx(
        "etiqueta tabular-nums",
        critico
          ? "bg-estado-atrasado/10 text-estado-atrasado"
          : atencao
            ? "bg-brass-50 text-brass-700"
            : "bg-ink/[.05] text-ink-muted"
      )}
      title={`Neste lugar ${haDias(dias)}`}
    >
      <Hourglass size={12} aria-hidden />
      {compacta ? `${dias}d` : dias <= 0 ? "Chegou hoje" : `${dias} ${dias === 1 ? "dia" : "dias"} parado`}
    </span>
  );
}

export function EtiquetaMotivo({ motivo }: { motivo: string | null }) {
  if (!motivo) return null;
  return (
    <span className="etiqueta bg-estado-info/10 text-estado-info">
      <PauseCircle size={12} aria-hidden />
      {ROTULO_MOTIVO_PARADA[motivo] ?? motivo}
    </span>
  );
}
