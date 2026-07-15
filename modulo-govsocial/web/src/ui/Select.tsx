import { forwardRef, useId, type SelectHTMLAttributes } from "react";
import clsx from "clsx";

export type OpcaoSelect = { valor: string; rotulo: string };

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> & {
  label: string; // label visível obrigatório (§6)
  id?: string;
  opcoes: OpcaoSelect[];
  erro?: string;
  obrigatorio?: boolean;
  placeholder?: string; // nunca substitui a label
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, id, opcoes, erro, obrigatorio, placeholder, className, ...resto },
  ref,
) {
  const gerado = useId();
  const selectId = id ?? gerado;
  const erroId = `${selectId}-erro`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={selectId} className="text-sm font-semibold text-ink">
        {label}
        {obrigatorio && (
          <span className="ml-1 text-danger" aria-hidden>
            *
          </span>
        )}
      </label>
      <select
        ref={ref}
        id={selectId}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? erroId : undefined}
        aria-required={obrigatorio || undefined}
        className={clsx(
          "rounded-input border bg-surface px-3 text-ink min-h-[44px]",
          "focus-visible:outline-focus",
          erro ? "border-danger" : "border-ink-soft/30 focus:border-primary",
          className,
        )}
        {...resto}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
      {erro && (
        <span id={erroId} role="alert" className="text-xs font-semibold text-danger">
          {erro}
        </span>
      )}
    </div>
  );
});
