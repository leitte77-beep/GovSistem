/* eslint-disable react-refresh/only-export-components, jsx-a11y/no-noninteractive-tabindex */
import { useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ExternalLink, Gift, Send, SlidersHorizontal } from "lucide-react";
import type { ItemTrilha } from "./montarTrilha";

const chip = "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold";

/** CANONICAL — matches E2/E3/E4 (3 atendimentos). */
export const ATENDIMENTOS_EXEMPLO = [
  {
    data: "15/07/2026 14:01",
    tipo: "Visita domiciliar",
    profissional: "Ana Paula Souza · Assistente social",
    membros: "Toda a família",
    situacao: "Concluído",
  },
  {
    data: "15/07/2026 10:03",
    tipo: "Atendimento individual · Escuta qualificada",
    profissional: "Ana Paula Souza · Assistente social",
    membros: "Fernanda Lima Oliveira",
    situacao: "Concluído",
  },
  {
    data: "15/07/2026 09:34",
    tipo: "Atendimento PAEFI",
    profissional: "Marcos Ribeiro · Psicólogo",
    membros: "Toda a família",
    situacao: "Com retorno",
  },
];

/** CANONICAL — matches E5/E6 (2 encaminhamentos). */
export const ENCAMINHAMENTOS_EXEMPLO = [
  {
    data: "14/07/2026",
    destino: "UBS Centro",
    motivo: "Avaliação de saúde",
    membro: "Juliana Lima Oliveira",
    situacao: "Recebido",
  },
  {
    data: "12/07/2026",
    destino: "CRAS de origem",
    motivo: "Atualização cadastral e CPF",
    membro: null, // escopo família
    situacao: "Devolutiva recebida",
  },
];

/** "dd/mm/aaaa[ hh:mm]" → ISO local. */
function paraIso(dataBr: string): string {
  const [dataParte, horaParte] = dataBr.split(" ");
  const [dia, mes, ano] = dataParte.split("/").map(Number);
  const [hora, minuto] = (horaParte ?? "12:00").split(":").map(Number);
  return new Date(ano, mes - 1, dia, hora, minuto).toISOString();
}

/**
 * Monta os 6 eventos CANÔNICOS de demonstração da Trilha:
 * E1 — Medida socioeducativa (14:15) · escopo PESSOA · "sobre: Lucas Lima Oliveira" · 🔒 Sigilo reforçado
 * E2 — Visita domiciliar (14:01) · escopo FAMÍLIA
 * E3 — Atendimento individual / escuta qualificada (10:03) · escopo PESSOA · "sobre: Fernanda Lima Oliveira"
 * E4 — Atendimento PAEFI (09:34) · escopo FAMÍLIA
 * E5 — Encaminhamento à rede de saúde (14/07) · escopo PESSOA · "sobre: Juliana Lima Oliveira"
 * E6 — Encaminhamento / retorno ao CRAS de origem (12/07) · escopo FAMÍLIA
 *
 * Contagem por tipo: Atendimento=3 (E2+E3+E4) · Encaminhamento=2 (E5+E6) · Medida=1 (E1) · Total=6
 */
export function montarEventosExemploTrilha(): ItemTrilha[] {
  return [
    /* ── E1 — Medida socioeducativa ── */
    {
      id: "exemplo-mse-lucas",
      data: paraIso("15/07/2026 14:15"),
      tipo: "MSE",
      tipoAtendimento: "INDIVIDUAL",
      serviceCode: "MSE",
      unitId: "u-cras-centro",
      unitNome: "CRAS Centro",
      daPropriaUnidade: true,
      attendanceId: null,
      caseFileId: null,
      sigilosoReforcado: true,
      podeLerEvolucao: true,
      sobre: "Lucas Lima Oliveira",
      conteudoExemplo: {
        texto:
          "Acompanhamento individual da medida socioeducativa de Lucas. Frequência regular às atividades da unidade; pendência de regularização de CPF em tratativa junto ao CRAS de origem.",
      },
    },
    /* ── E2 — Visita domiciliar ── */
    {
      id: "exemplo-atendimento-0",
      data: paraIso("15/07/2026 14:01"),
      tipo: "VISITA",
      tipoAtendimento: "VISITA_DOMICILIAR",
      serviceCode: "PAIF",
      unitId: "u-cras-centro",
      unitNome: "CRAS Centro",
      daPropriaUnidade: true,
      attendanceId: null,
      caseFileId: null,
      sigilosoReforcado: false,
      podeLerEvolucao: true,
      conteudoExemplo: {
        texto:
          "Visita domiciliar realizada com toda a família. Observadas condições de moradia adequadas; reforçada orientação sobre organização financeira e regularização documental pendente.",
      },
    },
    /* ── E3 — Atendimento individual / escuta qualificada ── */
    {
      id: "exemplo-atendimento-1",
      data: paraIso("15/07/2026 10:03"),
      tipo: "PAIF",
      tipoAtendimento: "INDIVIDUAL",
      serviceCode: "PAIF",
      unitId: "u-cras-centro",
      unitNome: "CRAS Centro",
      daPropriaUnidade: true,
      attendanceId: null,
      caseFileId: null,
      sigilosoReforcado: false,
      podeLerEvolucao: true,
      sobre: "Fernanda Lima Oliveira",
      conteudoExemplo: {
        texto:
          "Atendimento individual com Fernanda Lima Oliveira. Escuta qualificada sobre demandas de saúde e organização familiar. Encaminhamentos já realizados.",
      },
    },
    /* ── E4 — Atendimento PAEFI ── */
    {
      id: "exemplo-atendimento-2",
      data: paraIso("15/07/2026 09:34"),
      tipo: "PAEFI",
      tipoAtendimento: "FAMILIAR",
      serviceCode: "PAEFI",
      unitId: "u-cras-centro",
      unitNome: "CRAS Centro",
      daPropriaUnidade: true,
      attendanceId: null,
      caseFileId: null,
      sigilosoReforcado: false,
      podeLerEvolucao: true,
      conteudoExemplo: {
        texto:
          "Atendimento PAEFI com toda a família. Acompanhamento psicossocial de violações de direitos. Avaliação em andamento; retorno agendado.",
      },
    },
    /* ── E5 — Encaminhamento à rede de saúde ── */
    {
      id: "exemplo-encaminhamento-0",
      data: paraIso("14/07/2026"),
      tipo: "ENCAMINHAMENTO",
      tipoAtendimento: "ENCAMINHAMENTO",
      serviceCode: "PAIF",
      unitId: "u-cras-centro",
      unitNome: "CRAS Centro",
      daPropriaUnidade: true,
      attendanceId: null,
      caseFileId: null,
      sigilosoReforcado: false,
      podeLerEvolucao: true,
      sobre: "Juliana Lima Oliveira",
      conteudoExemplo: {
        texto:
          "Encaminhamento à UBS Centro para avaliação de saúde de Juliana Lima Oliveira. Situação: recebido pela unidade de destino.",
      },
    },
    /* ── E6 — Encaminhamento / retorno ao CRAS de origem ── */
    {
      id: "exemplo-encaminhamento-1",
      data: paraIso("12/07/2026"),
      tipo: "ENCAMINHAMENTO",
      tipoAtendimento: "ENCAMINHAMENTO",
      serviceCode: "PAIF",
      unitId: "u-cras-centro",
      unitNome: "CRAS Centro",
      daPropriaUnidade: true,
      attendanceId: null,
      caseFileId: null,
      sigilosoReforcado: false,
      podeLerEvolucao: true,
      conteudoExemplo: {
        texto:
          "Encaminhamento ao CRAS de origem para atualização cadastral e regularização do CPF de Lucas. Devolutiva recebida.",
      },
    },
  ];
}

export function BarraFiltrosTrilha() {
  const [ordem, setOrdem] = useState<"recentes" | "antigos">("recentes");
  const controle = "min-h-10 rounded-lg border border-outline-variant/40 bg-surface px-3 text-sm text-ink focus-visible:outline-focus";
  return <div className="mb-5 space-y-3 rounded-xl border border-outline-variant/30 bg-surface-container-low p-4">
    <div className="flex flex-wrap items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-primary" /><strong className="mr-auto text-sm text-ink">Filtrar trilha</strong><div className="inline-flex rounded-lg border border-outline-variant/40 bg-surface p-0.5" role="group" aria-label="Ordem da trilha"><button type="button" onClick={() => setOrdem("recentes")} aria-pressed={ordem === "recentes"} className={`min-h-9 rounded-md px-3 text-xs font-semibold focus-visible:outline-focus ${ordem === "recentes" ? "bg-primary text-on-primary" : "text-ink-soft"}`}>Mais recentes</button><button type="button" onClick={() => setOrdem("antigos")} aria-pressed={ordem === "antigos"} className={`min-h-9 rounded-md px-3 text-xs font-semibold focus-visible:outline-focus ${ordem === "antigos" ? "bg-primary text-on-primary" : "text-ink-soft"}`}>Mais antigos</button></div></div>
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><select className={controle} aria-label="Tipo de evento"><option>Todos os tipos</option><option>Atendimento</option><option>Benefício</option><option>Encaminhamento</option><option>Medida</option><option>Observação</option><option>Visita</option></select><select className={controle} aria-label="Membro relacionado"><option>Toda a família e membros</option><option>Toda a família</option><option>Carlos Henrique Oliveira Santos</option><option>Fernanda Lima Oliveira</option><option>Juliana Lima Oliveira</option><option>Lucas Lima Oliveira</option></select><label className={`${controle} flex items-center gap-2`}><CalendarDays className="h-4 w-4 text-outline" /><span className="text-xs text-ink-soft">De</span><input type="date" className="min-w-0 bg-transparent focus:outline-none" aria-label="Período inicial" /></label><label className={`${controle} flex items-center gap-2`}><span className="text-xs text-ink-soft">Até</span><input type="date" className="min-w-0 bg-transparent focus:outline-none" aria-label="Período final" /></label></div>
    <div className="flex flex-wrap gap-2"><span className="text-xs font-medium text-ink-soft">Atalhos:</span>{["Últimos 30 dias", "Este mês", "Este ano"].map((r) => <button type="button" key={r} className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary-soft focus-visible:outline-focus">{r}</button>)}</div>
  </div>;
}

/** Legenda da trilha — TABELA CANÔNICA: Atendimento=Roxo · Benefício=Verde · Encaminhamento=Azul · Medida/atenção=Âmbar · Registro=Cinza */
export function LegendaTrilha() {
  const dot = "mr-1.5 inline-block h-2.5 w-2.5 rounded-full";
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-xs text-ink" aria-label="Legenda da trilha">
      <strong className="text-ink">Legenda:</strong>
      <span><i className={`${dot} bg-evt-visita`} />Atendimento</span>
      <span><i className={`${dot} bg-evt-beneficio`} />Benefício</span>
      <span><i className={`${dot} bg-evt-encaminhamento`} />Encaminhamento</span>
      <span><i className={`${dot} bg-evt-mse`} />Medida/atenção</span>
      <span><i className={`${dot} bg-ink-soft`} />Registro administrativo</span>
    </div>
  );
}

export function AbaBeneficiosAprimorada({ familyId, pbfAtivo: _pbfAtivo }: { familyId: string; pbfAtivo: boolean }) {
  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-outline-variant/30 bg-surface p-5">
        <div className="flex items-center gap-2">
          <Gift className="h-5 w-5 text-emerald-700" />
          <h3 className="font-semibold text-ink">Benefícios de transferência de renda (via CadÚnico)</h3>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className={`${chip} bg-[var(--ga-chip-pbf-bg)] text-[var(--ga-chip-pbf-text)]`}>PBF ativo</span>
          <span className={`${chip} bg-[var(--ga-chip-pbf-bg)] text-[var(--ga-chip-pbf-text)]`}>Bolsa Família</span>
        </div>
        <p className="mt-3 text-sm text-ink-soft">Dados sincronizados do CadÚnico; edite na base federal.</p>
      </section>
      <section className="rounded-xl border border-outline-variant/30 bg-surface p-6 text-center">
        <Gift className="mx-auto h-9 w-9 text-outline" />
        <h3 className="mt-3 font-semibold text-ink">Nenhum benefício eventual da rede registrado</h3>
        <p className="mx-auto mt-1 max-w-xl text-sm text-ink-soft">
          Nenhum benefício EVENTUAL da rede foi registrado para esta família. Benefícios federais como PBF/BPC aparecem no bloco acima.
        </p>
        <Link to={`/beneficios?familia=${familyId}`} className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary focus-visible:outline-focus">
          Conceder benefício eventual
        </Link>
      </section>
    </div>
  );
}

export function AbaEncaminhamentosAprimorada() {
  return (
    <div className="space-y-4">
      <SecaoTabela titulo="Encaminhamentos desta família" subtitulo="Envios, recebimentos e devolutivas vinculados ao prontuário." icone={<Send className="h-5 w-5" />}>
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr>
              {["Data", "Destino", "Motivo", "Sobre", "Situação"].map((h) => (
                <th key={h} className="border-b border-outline-variant/30 px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-ink-soft">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ENCAMINHAMENTOS_EXEMPLO.map((e) => (
              <tr key={e.data} tabIndex={0} className="border-b border-outline-variant/20 hover:bg-surface-container-low focus-visible:outline-focus">
                <td className="px-3 py-3 font-medium text-ink">{e.data}</td>
                <td className="px-3 py-3 text-ink">{e.destino}</td>
                <td className="px-3 py-3 text-ink-soft">{e.motivo}</td>
                <td className="px-3 py-3">
                  {e.membro ? (
                    <span className={`${chip} bg-surface-container-high text-ink`}>{e.membro}</span>
                  ) : (
                    <span className="text-ink-soft text-xs">Família</span>
                  )}
                </td>
                <td className="px-3 py-3 text-ink-soft">{e.situacao}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SecaoTabela>
      <Link to="/encaminhamentos" className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-primary/30 px-3 text-sm font-semibold text-primary hover:bg-primary-soft focus-visible:outline-focus">
        Abrir área de Encaminhamentos <ExternalLink className="h-4 w-4" />
      </Link>
    </div>
  );
}

function SecaoTabela({ titulo, subtitulo, icone, children }: { titulo: string; subtitulo: string; icone: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-outline-variant/30 bg-surface">
      <header className="flex items-start gap-2 p-4">
        <span className="text-primary">{icone}</span>
        <div>
          <h3 className="font-semibold text-ink">{titulo}</h3>
          <p className="text-sm text-ink-soft">{subtitulo}</p>
        </div>
      </header>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}
