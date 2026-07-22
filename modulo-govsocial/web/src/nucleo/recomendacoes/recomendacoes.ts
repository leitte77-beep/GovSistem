import type { Recommendation, RecommendationScope } from "@/tipos/dashboard";

type Rule = {
  id: string;
  severity: Recommendation["severity"];
  title: (scope: RecommendationScope) => string;
  detail?: (scope: RecommendationScope) => string;
  ctaLabel: string;
  to: string;
  icon: string;
  condition: (scope: RecommendationScope) => boolean;
  priority: number;
};

const REGRAS: Rule[] = [
  {
    id: "rma_fechamento",
    severity: "alerta",
    condition: (s) => !s.rmaFechado && s.diasAteFimDoMes <= 3 && s.diasAteFimDoMes >= 0,
    title: (s) =>
      `Fechamento do RMA de ${s.mesAtual} em ${s.diasAteFimDoMes} ${s.diasAteFimDoMes === 1 ? "dia" : "dias"}`,
    detail: (s) => `O Relatório Mensal de Atividades de ${s.mesAtual} ainda não foi fechado.`,
    ctaLabel: "Fechar RMA",
    to: "/rma",
    icon: "description",
    priority: 1,
  },
  {
    id: "nis_pendente",
    severity: "atencao",
    condition: (s) => s.nisPendentes > 0,
    title: (s) => `${s.nisPendentes} cadastro(s) com NIS pendente`,
    detail: (s) =>
      `Existem ${s.nisPendentes} família(s) ou pessoa(s) com NIS incompleto ou pendente de atualização.`,
    ctaLabel: "Revisar cadastros",
    to: "/familias?filtro=nis_pendente",
    icon: "fingerprint",
    priority: 2,
  },
  {
    id: "sem_atendimento_90d",
    severity: "atencao",
    condition: (s) => s.semAtendimento90d > 0,
    title: (s) => `${s.semAtendimento90d} família(s) sem atendimento há 90+ dias`,
    detail: () =>
      "Famílias em acompanhamento que não recebem atendimento há mais de 90 dias. O SUAS exige acompanhamento periódico.",
    ctaLabel: "Ver famílias",
    to: "/familias?filtro=sem_atendimento_90d",
    icon: "schedule",
    priority: 3,
  },
  {
    id: "agendamentos_hoje",
    severity: "info",
    condition: (s) => s.agendamentosHoje > 0,
    title: (s) => `${s.agendamentosHoje} agendamento(s) para hoje`,
    detail: () => "Há agendamentos previstos para hoje. Verifique a fila e organize os atendimentos.",
    ctaLabel: "Ver agenda",
    to: "/agenda",
    icon: "event_note",
    priority: 4,
  },
  {
    id: "aniversariantes",
    severity: "info",
    condition: (s) => s.aniversariantesSemana > 0,
    title: (s) => `${s.aniversariantesSemana} aniversariante(s) esta semana`,
    detail: () => "Pessoas cadastradas que fazem aniversário nos próximos 7 dias.",
    ctaLabel: "Ver aniversariantes",
    to: "/familias?filtro=aniversariantes",
    icon: "cake",
    priority: 5,
  },
  {
    id: "encaminhamentos_prazo",
    severity: "alerta",
    condition: (s) => s.encaminhamentosPrazo > 0,
    title: (s) => `${s.encaminhamentosPrazo} encaminhamento(s) com prazo próximo`,
    detail: () => "Encaminhamentos cujo prazo de resposta está vencendo em breve.",
    ctaLabel: "Ver encaminhamentos",
    to: "/encaminhamentos?filtro=prazo",
    icon: "forward_to_inbox",
    priority: 6,
  },
];

export function getRecommendations(scope: RecommendationScope): Recommendation[] {
  return REGRAS
    .filter((r) => r.condition(scope))
    .sort((a, b) => a.priority - b.priority)
    .map((r) => ({
      id: r.id,
      severity: r.severity,
      title: r.title(scope),
      detail: r.detail?.(scope),
      ctaLabel: r.ctaLabel,
      to: r.to,
      icon: r.icon,
    }));
}
