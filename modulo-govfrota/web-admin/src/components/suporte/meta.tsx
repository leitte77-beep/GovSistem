import { Bug, CheckCircle2, CircleDot, HelpCircle, Lightbulb, Loader, Wrench } from "lucide-react";
import type { StatusChamado, TipoChamado } from "@/lib/portalPosto";

/** Rótulos, ícones e cores dos chamados de suporte — usados no portal do posto e no painel. */

export const TIPOS: Record<TipoChamado, { rotulo: string; texto: string; icone: typeof Bug; cor: string; claro: string }> = {
  PROBLEMA: { rotulo: "Problema", texto: "Algo não funciona ou deu erro", icone: Bug, cor: "from-[#F87171] to-[#DC2626]", claro: "bg-[#FEE4E2] text-[#B42318]" },
  CORRECAO: { rotulo: "Pedido de correção", texto: "Dado errado em abastecimento ou nota", icone: Wrench, cor: "from-[#FBBF24] to-[#D97706]", claro: "bg-[#FFF4D6] text-[#92400E]" },
  DUVIDA: { rotulo: "Dúvida", texto: "Como usar alguma parte do portal", icone: HelpCircle, cor: "from-[#60A5FA] to-[#1D4ED8]", claro: "bg-[#E5EEFF] text-[#1D4ED8]" },
  SUGESTAO: { rotulo: "Sugestão", texto: "Ideia para melhorar o sistema", icone: Lightbulb, cor: "from-[#34D399] to-[#059669]", claro: "bg-[#E7F8EC] text-[#106D34]" },
};

export const STATUS: Record<StatusChamado, { rotulo: string; icone: typeof Bug; classe: string }> = {
  ABERTO: { rotulo: "Aberto", icone: CircleDot, classe: "bg-[#FFF4D6] text-[#92400E] ring-[#F5D78E]" },
  EM_ANDAMENTO: { rotulo: "Em andamento", icone: Loader, classe: "bg-[#E5EEFF] text-[#1D4ED8] ring-[#BFD3FF]" },
  RESOLVIDO: { rotulo: "Resolvido", icone: CheckCircle2, classe: "bg-[#E7F8EC] text-[#106D34] ring-[#B7E4C7]" },
};

export function SeloStatus({ status }: { status: StatusChamado }) {
  const s = STATUS[status] ?? STATUS.ABERTO;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${s.classe}`}>
      <s.icone size={12} aria-hidden /> {s.rotulo}
    </span>
  );
}

export const quando = (d: string) => new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
