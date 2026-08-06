import { forwardRef, useId } from "react";
import clsx from "clsx";
import { Check } from "lucide-react";
import { apenasDigitos, validarNis } from "@/nucleo/validadoresBr";

function formatarNisParcial(valor: string): string {
  const d = apenasDigitos(valor).slice(0, 11);
  // NIS/PIS: 000.00000.00-0
  const p = [d.slice(0, 3), d.slice(3, 8), d.slice(8, 10), d.slice(10, 11)];
  let saida = p[0];
  if (p[1]) saida += "." + p[1];
  if (p[2]) saida += "." + p[2];
  if (p[3]) saida += "-" + p[3];
  return saida;
}

/**
 * <CampoNIS>: máscara e validação de DV do NIS/PIS em tempo real.
 * Exibe o número completo — usar apenas em telas de edição autorizadas (LGPD).
 */
export type CampoNisProps = {
  label?: string;
  id?: string;
  valor: string;
  aoMudar: (digitos: string) => void;
  obrigatorio?: boolean;
  erroExterno?: string;
};

export const CampoNIS = forwardRef<HTMLInputElement, CampoNisProps>(function CampoNIS(
  { label = "NIS", id, valor, aoMudar, obrigatorio, erroExterno },
  ref,
) {
  const gerado = useId();
  const inputId = id ?? gerado;
  const erroId = `${inputId}-erro`;
  const statusId = `${inputId}-status`;

  const digitos = apenasDigitos(valor);
  const completo = digitos.length === 11;
  const valido = completo && validarNis(digitos);
  const erroDv = completo && !valido ? "NIS inválido — confira o dígito verificador." : "";
  const erro = erroExterno || erroDv;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-semibold text-ink">
        {label}
        {obrigatorio && (
          <span className="ml-1 text-danger" aria-hidden>
            *
          </span>
        )}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          inputMode="numeric"
          autoComplete="off"
          placeholder="000.00000.00-0"
          value={formatarNisParcial(digitos)}
          onChange={(e) => aoMudar(apenasDigitos(e.target.value).slice(0, 11))}
          aria-invalid={erro ? true : undefined}
          aria-describedby={[erro ? erroId : null, valido ? statusId : null]
            .filter(Boolean)
            .join(" ") || undefined}
          aria-required={obrigatorio || undefined}
          className={clsx(
            "fonte-mono w-full rounded-input border bg-surface px-3 pr-9 text-ink min-h-[44px]",
            "focus-visible:outline-focus",
            erro ? "border-danger" : valido ? "border-primary" : "border-ink-soft/30",
          )}
        />
        {valido && (
          <Check
            aria-hidden
            className="pointer-events-none absolute right-2 top-1/2 h-5 w-5 -translate-y-1/2 text-primary"
          />
        )}
      </div>
      {valido && (
        <span id={statusId} className="text-xs font-semibold text-primary">
          NIS válido
        </span>
      )}
      {erro && (
        <span id={erroId} role="alert" className="text-xs font-semibold text-danger">
          {erro}
        </span>
      )}
    </div>
  );
});
