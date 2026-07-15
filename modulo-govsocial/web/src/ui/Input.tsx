import { forwardRef, useId, type InputHTMLAttributes } from "react";
import clsx from "clsx";

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  label: string; // label visível é obrigatório (§6)
  id?: string;
  erro?: string;
  dica?: string;
  obrigatorio?: boolean;
  /** Fonte monoespaçada para CPF/NIS/protocolos (§2). */
  mono?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, id, erro, dica, obrigatorio, mono, className, ...resto },
  ref,
) {
  const gerado = useId();
  const inputId = id ?? gerado;
  const erroId = `${inputId}-erro`;
  const dicaId = `${inputId}-dica`;
  // Associa erro/dica ao input por aria-describedby (§6).
  const describedBy = [erro ? erroId : null, dica ? dicaId : null]
    .filter(Boolean)
    .join(" ");

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
      {dica && (
        <span id={dicaId} className="text-xs text-ink-soft">
          {dica}
        </span>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={erro ? true : undefined}
        aria-describedby={describedBy || undefined}
        aria-required={obrigatorio || undefined}
        className={clsx(
          "rounded-input border bg-surface px-3 text-ink placeholder:text-ink-soft/60",
          "min-h-[44px] focus-visible:outline-focus",
          mono && "fonte-mono",
          erro ? "border-danger" : "border-ink-soft/30 focus:border-primary",
          className,
        )}
        {...resto}
      />
      {erro && (
        <span id={erroId} role="alert" className="text-xs font-semibold text-danger">
          {erro}
        </span>
      )}
    </div>
  );
});
