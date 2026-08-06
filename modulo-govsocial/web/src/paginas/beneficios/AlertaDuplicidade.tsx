import { AlertTriangle } from "lucide-react";
import type { AvisoDuplicidade } from "./duplicidade";
import { rotuloBeneficio } from "./rotulos";

/**
 * Alerta de duplicidade em destaque âmbar (§4.4): mostra que a família recebeu o
 * mesmo benefício dentro da janela mínima do município. Comporta bloqueio ou
 * justificativa conforme o parâmetro (aqui, informativo + confirmação no envio).
 */
export function AlertaDuplicidade({
  aviso,
  benefitCode,
}: {
  aviso: AvisoDuplicidade;
  benefitCode: string;
}) {
  if (!aviso.duplicado || aviso.diasDesde === null) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-input border border-amber/40 bg-amber/10 p-3 text-sm text-amber"
    >
      <AlertTriangle aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <strong className="block">
          {rotuloBeneficio(benefitCode)} concedida há {aviso.diasDesde}{" "}
          {aviso.diasDesde === 1 ? "dia" : "dias"}.
        </strong>
        <span className="text-ink">
          Janela mínima do município: {aviso.janelaDias} dias. Registre uma
          justificativa antes de conceder novamente.
        </span>
      </div>
    </div>
  );
}
