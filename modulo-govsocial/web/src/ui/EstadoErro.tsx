import { AlertTriangle } from "lucide-react";
import type { ProblemDetails } from "@/tipos/api";
import { mensagemAmigavel } from "@/nucleo/http/problemDetails";
import { textos } from "@/i18n/textos";
import { Botao } from "./Botao";

/**
 * Estado de erro: mostra a mensagem do Problem Details já traduzida em pt-BR
 * (§11). Nunca exibe stack trace nem dado pessoal.
 */
export function EstadoErro({
  problema,
  aoTentarNovamente,
}: {
  problema?: ProblemDetails;
  aoTentarNovamente?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-cartao border border-danger/30 bg-danger/5 p-8 text-center"
    >
      <AlertTriangle className="h-8 w-8 text-danger" aria-hidden />
      <h3 className="text-base text-danger">{problema?.title || "Não foi possível carregar"}</h3>
      <p className="max-w-md text-sm text-ink">{problema ? mensagemAmigavel(problema) : "Ocorreu um erro inesperado."}</p>
      {aoTentarNovamente && (
        <Botao variante="secundario" onClick={aoTentarNovamente}>
          {textos.acoes.tentarNovamente}
        </Botao>
      )}
    </div>
  );
}
