import { Check } from "lucide-react";
import clsx from "clsx";
import type { MemberOut } from "@/tipos/pessoas";
import { rotuloDe, PARENTESCO } from "@/i18n/dominios";

/**
 * <SeletorMembros> — chips da composição familiar; toque marca/desmarca quem foi
 * atendido (§4.3). Acessível: cada chip é um botão com aria-pressed.
 */
export function SeletorMembros({
  membros,
  selecionados,
  aoAlternar,
}: {
  membros: MemberOut[];
  selecionados: Set<string>;
  aoAlternar: (personId: string) => void;
}) {
  const ativos = membros.filter((m) => m.status === "ATIVO");
  if (ativos.length === 0) {
    return <p className="text-sm text-ink-soft">Nenhum membro ativo na composição.</p>;
  }
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Membros atendidos">
      {ativos.map((m) => {
        const marcado = selecionados.has(m.person_id);
        return (
          <button
            key={m.person_id}
            type="button"
            aria-pressed={marcado}
            onClick={() => aoAlternar(m.person_id)}
            className={clsx(
              "inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3 text-sm font-semibold focus-visible:outline-focus",
              marcado
                ? "border-primary bg-primary-soft text-primary"
                : "border-ink-soft/30 bg-surface text-ink hover:border-primary",
            )}
          >
            {marcado && <Check aria-hidden className="h-4 w-4" />}
            {m.nome_exibicao}
            <span className="text-xs font-normal text-ink-soft">
              {rotuloDe(PARENTESCO, m.parentesco)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
