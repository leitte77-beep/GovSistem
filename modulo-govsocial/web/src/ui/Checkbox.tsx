import { forwardRef, useId, type InputHTMLAttributes } from "react";
import clsx from "clsx";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type"> & {
  label: string;
  id?: string;
  dica?: string;
};

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, id, dica, className, ...resto },
  ref,
) {
  const gerado = useId();
  const inputId = id ?? gerado;
  const dicaId = `${inputId}-dica`;
  return (
    <div className="flex items-start gap-2">
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        aria-describedby={dica ? dicaId : undefined}
        className={clsx(
          "mt-0.5 h-5 w-5 shrink-0 rounded border-ink-soft/40 text-primary focus-visible:outline-focus",
          className,
        )}
        {...resto}
      />
      <label htmlFor={inputId} className="text-sm text-ink">
        {label}
        {dica && (
          <span id={dicaId} className="block text-xs text-ink-soft">
            {dica}
          </span>
        )}
      </label>
    </div>
  );
});
