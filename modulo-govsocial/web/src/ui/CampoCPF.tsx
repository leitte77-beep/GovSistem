import { forwardRef, useId } from "react";
import clsx from "clsx";
import { Check } from "lucide-react";
import {
  apenasDigitos,
  formatarCpfParcial,
  validarCpf,
} from "@/nucleo/validadoresBr";

/**
 * <CampoCPF>: máscara progressiva (000.000.000-00) e validação de dígito
 * verificador em tempo real (§Fase 2). O valor exposto ao formulário são
 * apenas os dígitos. Mostra estado válido/ inválido com TEXTO (não só cor).
 *
 * IMPORTANTE (LGPD): este campo exibe o CPF completo — usar apenas em telas de
 * edição autorizadas. Listagens usam o valor mascarado do backend.
 */
export type CampoCpfProps = {
  label?: string;
  id?: string;
  valor: string; // dígitos
  aoMudar: (digitos: string) => void;
  obrigatorio?: boolean;
  erroExterno?: string;
};

export const CampoCPF = forwardRef<HTMLInputElement, CampoCpfProps>(function CampoCPF(
  { label = "CPF", id, valor, aoMudar, obrigatorio, erroExterno },
  ref,
) {
  const gerado = useId();
  const inputId = id ?? gerado;
  const erroId = `${inputId}-erro`;
  const statusId = `${inputId}-status`;

  const digitos = apenasDigitos(valor);
  const completo = digitos.length === 11;
  const valido = completo && validarCpf(digitos);
  const erroDv = completo && !valido ? "CPF inválido — confira os dígitos verificadores." : "";
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
          placeholder="000.000.000-00"
          value={formatarCpfParcial(digitos)}
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
          CPF válido
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
