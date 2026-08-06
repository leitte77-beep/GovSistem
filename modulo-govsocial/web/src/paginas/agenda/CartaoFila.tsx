import clsx from "clsx";
import { Clock } from "lucide-react";
import { Botao } from "@/ui/Botao";
import { Chip } from "@/ui/Chip";
import {
  formatarEspera,
  minutosDeEspera,
  urgenciaEspera,
  type UrgenciaEspera,
} from "@/paginas/agenda/tempo";
import { rotuloTipoAgendamento } from "@/paginas/agenda/rotulos";
import type { AppointmentOut } from "@/tipos/agenda";

/**
 * <CartaoFila> — cartão de um item da fila do dia (§4.6). Mostra nome do
 * cidadão (resolvido pela página), motivo NÃO sensível e o tempo de espera; a
 * cor de urgência sempre vem acompanhada de texto (nunca só cor). As ações
 * variam por coluna: check-in, chamar, concluir.
 */
export type AcaoFila = {
  rotulo: string;
  aoClicar: () => void;
  variante?: "primario" | "secundario" | "texto";
};

const BORDA_URGENCIA: Record<UrgenciaEspera, string> = {
  normal: "border-ink-soft/15",
  atencao: "border-amber/50",
  critica: "border-danger/50",
};

export function CartaoFila({
  agendamento,
  nome,
  acoes = [],
  agora,
}: {
  agendamento: AppointmentOut;
  nome: string;
  acoes?: AcaoFila[];
  /** Injetável para testes determinísticos. */
  agora?: Date;
}) {
  const minutos = minutosDeEspera(agendamento.created_at, agora);
  const urgencia = urgenciaEspera(minutos);
  const mostraEspera =
    agendamento.status === "AGUARDANDO" || agendamento.status === "AGENDADO";

  return (
    <article
      className={clsx(
        "rounded-cartao border bg-surface p-3 shadow-um",
        BORDA_URGENCIA[urgencia],
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-ink">{nome}</p>
          {agendamento.observacoes && (
            <p className="mt-0.5 text-sm text-ink-soft">{agendamento.observacoes}</p>
          )}
        </div>
        {agendamento.senha && (
          <span
            className="rounded-input bg-primary-soft px-2 py-1 text-sm font-semibold text-primary"
            aria-label={`Senha ${agendamento.senha}`}
          >
            {agendamento.senha}
          </span>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <Chip cor="neutro">{rotuloTipoAgendamento(agendamento.tipo)}</Chip>
        {mostraEspera && (
          <span
            className={clsx(
              "inline-flex items-center gap-1 font-semibold",
              urgencia === "critica" && "text-danger",
              urgencia === "atencao" && "text-amber",
              urgencia === "normal" && "text-ink-soft",
            )}
          >
            <Clock aria-hidden className="h-4 w-4" />
            Espera: {formatarEspera(minutos)}
          </span>
        )}
      </div>

      {acoes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {acoes.map((a) => (
            <Botao
              key={a.rotulo}
              variante={a.variante ?? "secundario"}
              tamanho="sm"
              onClick={a.aoClicar}
            >
              {a.rotulo}
            </Botao>
          ))}
        </div>
      )}
    </article>
  );
}
