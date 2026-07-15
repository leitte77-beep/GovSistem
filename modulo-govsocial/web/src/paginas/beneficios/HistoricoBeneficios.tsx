import { Chip, type CorChip } from "@/ui/Chip";
import { EstadoVazio } from "@/ui/EstadoVazio";
import { Skeleton } from "@/ui/Skeleton";
import { formatarData } from "@/nucleo/datas";
import { rotuloBeneficio } from "./rotulos";
import type { ConcessaoListItem, StatusConcessao } from "@/tipos/beneficios";

const COR_STATUS: Record<StatusConcessao, CorChip> = {
  SOLICITADO: "neutro",
  EM_ANALISE: "primario",
  APROVADO: "primario",
  ENTREGUE: "beneficio",
  NEGADO: "danger",
  CANCELADO: "neutro",
};

const ROTULO_STATUS: Record<StatusConcessao, string> = {
  SOLICITADO: "Solicitado",
  EM_ANALISE: "Em análise",
  APROVADO: "Aprovado",
  ENTREGUE: "Entregue",
  NEGADO: "Negado",
  CANCELADO: "Cancelado",
};

/**
 * Histórico de concessões da família na rede (coluna direita da tela de
 * concessão, §4.4). Ordenado por data; usado também para calcular a duplicidade.
 */
export function HistoricoBeneficios({
  concessoes,
  carregando,
}: {
  concessoes: ConcessaoListItem[];
  carregando?: boolean;
}) {
  if (carregando) return <Skeleton variante="tabela" linhas={4} />;
  if (concessoes.length === 0) {
    return (
      <EstadoVazio
        titulo="Sem benefícios registrados"
        descricao="Esta família ainda não recebeu benefícios eventuais na rede."
      />
    );
  }
  return (
    <ul className="space-y-2">
      {concessoes.map((c) => (
        <li
          key={c.id}
          className="flex items-center justify-between gap-2 rounded-input border border-ink-soft/15 bg-surface p-3"
        >
          <div>
            <span className="font-semibold text-ink">{rotuloBeneficio(c.benefit_type_code)}</span>
            <div className="text-xs text-ink-soft">
              Solicitado em {formatarData(c.data_solicitacao)}
              {c.valor_total != null && <> · R$ {c.valor_total.toFixed(2)}</>}
            </div>
          </div>
          <Chip cor={COR_STATUS[c.status]}>{ROTULO_STATUS[c.status]}</Chip>
        </li>
      ))}
    </ul>
  );
}
