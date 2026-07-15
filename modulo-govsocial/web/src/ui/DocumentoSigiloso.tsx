import type { ReactNode } from "react";
import { Pencil } from "lucide-react";

/**
 * <DocumentoSigiloso> — CPF/NIS em telas de edição (§1.2 "sigilo visível").
 *
 * O backend nunca devolve o documento completo, só a forma mascarada, então o
 * formulário não tem como pré-preencher o campo. Em vez de exibir um campo
 * vazio (que faz parecer que o dado sumiu), mostramos o valor mascarado em
 * repouso e só abrimos a digitação quando o usuário pede explicitamente —
 * deixando claro que digitar ali SUBSTITUI o número atual.
 */
export type DocumentoSigilosoProps = {
  label: string;
  /** Valor mascarado vindo do backend (ex.: ***.***.***-25). */
  mascarado: string | null;
  editando: boolean;
  aoAlternar: (editando: boolean) => void;
  /** O campo de digitação (CampoCPF/CampoNIS), renderizado só em edição. */
  children: ReactNode;
};

export function DocumentoSigiloso({
  label,
  mascarado,
  editando,
  aoAlternar,
  children,
}: DocumentoSigilosoProps) {
  if (editando) {
    return (
      <div className="flex flex-col gap-1">
        {children}
        <button
          type="button"
          onClick={() => aoAlternar(false)}
          className="self-start text-xs font-semibold text-ink-soft underline hover:text-ink focus-visible:outline-focus"
        >
          Cancelar alteração de {label}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <div className="flex items-center gap-2 rounded-input border border-ink-soft/30 bg-surface-container-low px-3 min-h-[44px]">
        <span className="fonte-mono flex-1 text-ink-soft">
          {mascarado ?? "Não informado"}
        </span>
        <button
          type="button"
          onClick={() => aoAlternar(true)}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10 focus-visible:outline-focus"
        >
          <Pencil aria-hidden className="h-3 w-3" />
          {mascarado ? "Alterar" : "Informar"}
        </button>
      </div>
      <span className="text-xs text-ink-soft">
        {mascarado
          ? "Ocultado por proteção de dados. Alterar substitui o número atual."
          : "Nenhum número cadastrado."}
      </span>
    </div>
  );
}
