import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import clsx from "clsx";

const CLASSE_BASE =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50 disabled:text-slate-400";

export function Campo({
  rotulo,
  erro,
  obrigatorio,
  dica,
  children,
  htmlFor,
}: {
  rotulo: string;
  erro?: string;
  obrigatorio?: boolean;
  dica?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-slate-700">
        {rotulo}
        {obrigatorio && <span className="text-red-500"> *</span>}
      </label>
      {children}
      {dica && !erro && <p className="text-xs text-slate-400">{dica}</p>}
      {erro && <p className="text-xs text-red-600">{erro}</p>}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx(CLASSE_BASE, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(CLASSE_BASE, "min-h-24 resize-y", className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx(CLASSE_BASE, className)} {...props}>
      {children}
    </select>
  );
}
