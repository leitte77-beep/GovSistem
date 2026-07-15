import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Botao } from "@/ui/Botao";

/**
 * Etapa 5 do wizard — Parâmetros de sigilo (§4.10). Escolha do sigilo PADRÃO
 * dos atendimentos da rede. É uma confirmação LOCAL (não é etapa do backend);
 * apenas registra a preferência e avança.
 */
export function PassoSigilo({ aoConfirmar }: { aoConfirmar: () => void }) {
  const [sigilo, setSigilo] = useState<"PADRAO" | "REFORCADO">("PADRAO");

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-cartao border border-sensitive/20 bg-sensitive/5 p-4">
        <ShieldCheck aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-sensitive" />
        <p className="text-sm text-ink">
          Defina o <strong>sigilo padrão</strong> dos atendimentos. Atendimentos
          marcados como <em>reforçado</em> ficam restritos a quem os registrou e à
          coordenação, mesmo dentro da unidade.
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-ink">Sigilo padrão da rede</legend>
        <label className="flex items-start gap-2 rounded-input border border-ink-soft/15 p-3 text-sm">
          <input
            type="radio"
            name="sigilo-padrao"
            checked={sigilo === "PADRAO"}
            onChange={() => setSigilo("PADRAO")}
            className="mt-0.5 h-4 w-4 accent-[var(--ga-primary)] focus-visible:outline-focus"
          />
          <span className="text-ink-soft">
            <span className="mb-0.5 block font-semibold text-ink">Padrão da unidade</span>
            Visível à equipe da unidade responsável pelo atendimento.
          </span>
        </label>
        <label className="flex items-start gap-2 rounded-input border border-ink-soft/15 p-3 text-sm">
          <input
            type="radio"
            name="sigilo-padrao"
            checked={sigilo === "REFORCADO"}
            onChange={() => setSigilo("REFORCADO")}
            className="mt-0.5 h-4 w-4 accent-[var(--ga-primary)] focus-visible:outline-focus"
          />
          <span className="text-ink-soft">
            <span className="mb-0.5 block font-semibold text-ink">Reforçado</span>
            Restrito a quem registrou e à coordenação. Recomendado para PAEFI/MSE.
          </span>
        </label>
      </fieldset>

      <div className="flex justify-end border-t border-ink-soft/15 pt-4">
        <Botao onClick={aoConfirmar}>Confirmar e avançar</Botao>
      </div>
    </div>
  );
}
