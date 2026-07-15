import { HandHeart } from "lucide-react";
import { Botao } from "@/ui/Botao";

/**
 * Etapa 4 do wizard — Tipos de benefício (§4.10). Semeia os domínios nacionais
 * de benefício eventual (cesta básica, auxílios etc.). Sem entrada do usuário;
 * o município ajusta critérios/valores/janelas depois.
 */
export function PassoBeneficios({
  enviando,
  aoSalvar,
}: {
  enviando: boolean;
  aoSalvar: (data: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-cartao border border-primary/20 bg-primary-soft p-4">
        <HandHeart aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <p className="text-sm text-ink">
          Vamos semear os <strong>tipos nacionais de benefício eventual</strong>{" "}
          (cesta básica, auxílio natalidade, auxílio funeral, passagem e outros).
          Depois você poderá ajustar critérios, valores e janelas de
          antiduplicidade em cada tipo.
        </p>
      </div>

      <div className="flex justify-end border-t border-ink-soft/15 pt-4">
        <Botao onClick={() => aoSalvar({})} carregando={enviando} bloqueiaDuploSubmit>
          Semear tipos nacionais e avançar
        </Botao>
      </div>
    </div>
  );
}
