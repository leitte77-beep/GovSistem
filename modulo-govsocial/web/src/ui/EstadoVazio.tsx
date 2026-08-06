import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { Botao } from "./Botao";

/**
 * Estado vazio que CONVIDA à ação (§2 microcopy).
 * Ex.: "Nenhuma família encontrada — Cadastrar nova família".
 */
export function EstadoVazio({
  titulo,
  descricao,
  acao,
  icone,
}: {
  titulo: string;
  descricao?: string;
  acao?: { rotulo: string; aoClicar: () => void };
  icone?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-cartao border border-dashed border-ink-soft/25 bg-surface p-8 text-center">
      <div className="text-ink-soft" aria-hidden>
        {icone ?? <Inbox className="h-8 w-8" />}
      </div>
      <h3 className="text-base">{titulo}</h3>
      {descricao && <p className="max-w-md text-sm text-ink-soft">{descricao}</p>}
      {acao && (
        <Botao variante="primario" onClick={acao.aoClicar}>
          {acao.rotulo}
        </Botao>
      )}
    </div>
  );
}
