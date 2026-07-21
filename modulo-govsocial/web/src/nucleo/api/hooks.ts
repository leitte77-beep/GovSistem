import { useQuery } from "@tanstack/react-query";
import { servicoBusca, servicoFamilias, servicoPessoas } from "@/nucleo/api/pessoas";
import { servicoProntuario } from "@/nucleo/api/prontuario";
import { servicoDominios } from "@/nucleo/api/atendimento";
import { servicoBeneficios } from "@/nucleo/api/beneficios";
import { servicoGrupos } from "@/nucleo/api/grupos";
import { servicoAgenda, servicoRecepcao } from "@/nucleo/api/agenda";
import { servicoEncaminhamentos } from "@/nucleo/api/encaminhamentos";
import { servicoRma } from "@/nucleo/api/rma";
import { servicoDashboard } from "@/nucleo/api/dashboard";
import { servicoAdmin } from "@/nucleo/api/admin";
import { servicoVigilanciaAvancada } from "@/nucleo/api/vigilanciaAvancada";
import { servicoPanicButton } from "@/nucleo/api/panicButton";

/**
 * Hooks de dados da Fase 2. staleTime curto: dados cadastrais mudam pouco
 * durante a sessão, mas evitamos servir informação velha de outra unidade.
 */

export function useBuscaUnificada(termo: string) {
  const habilitado = termo.trim().length >= 2;
  return useQuery({
    queryKey: ["busca", termo.trim()],
    queryFn: ({ signal }) => servicoBusca.unificada(termo.trim(), signal),
    enabled: habilitado,
    staleTime: 15_000,
  });
}

export function useFamilias(params?: { search?: string; territorio?: string }) {
  return useQuery({
    queryKey: ["familias", params?.search ?? "", params?.territorio ?? ""],
    queryFn: () => servicoFamilias.listar(params),
    staleTime: 20_000,
  });
}

export function usePessoas(busca?: string) {
  return useQuery({
    queryKey: ["pessoas", busca ?? ""],
    queryFn: () => servicoPessoas.listar(busca),
    staleTime: 20_000,
  });
}

export function useFamilia(id: string | undefined) {
  return useQuery({
    queryKey: ["familia", id],
    queryFn: () => servicoFamilias.obter(id as string),
    enabled: Boolean(id),
  });
}

// ── Prontuário (Fase 3) ──────────────────────────────────────────
export function useProntuariosDaUnidade(unitId: string | undefined) {
  return useQuery({
    queryKey: ["case-files", "unidade", unitId ?? "auto"],
    queryFn: () => servicoProntuario.listarDaUnidade(unitId, { limit: 100 }),
    staleTime: 15_000,
  });
}

export function useTiposServico() {
  return useQuery({
    queryKey: ["service-types"],
    queryFn: () => servicoDominios.serviceTypes(),
    staleTime: 60_000,
  });
}

export function useProntuariosDaFamilia(familyId: string | undefined) {
  return useQuery({
    queryKey: ["prontuarios", familyId],
    queryFn: () => servicoProntuario.listarPorFamilia(familyId as string),
    enabled: Boolean(familyId),
    staleTime: 20_000,
  });
}

export function useTimeline(caseFileId: string | undefined) {
  return useQuery({
    queryKey: ["timeline", caseFileId],
    queryFn: () => servicoProntuario.timeline(caseFileId as string),
    enabled: Boolean(caseFileId),
    staleTime: 15_000,
  });
}

export function useVisaoDeRede(familyId: string | undefined) {
  return useQuery({
    queryKey: ["rede", familyId],
    queryFn: () => servicoProntuario.visaoDeRede(familyId as string),
    enabled: Boolean(familyId),
    staleTime: 20_000,
  });
}

// ── Benefícios (Fase 5) ──────────────────────────────────────────
export function useTiposBeneficio() {
  return useQuery({
    queryKey: ["benefit-types"],
    queryFn: () => servicoBeneficios.tipos(),
    staleTime: 60_000,
  });
}

export function useConcessoesDaFamilia(familyId: string | undefined) {
  return useQuery({
    queryKey: ["concessoes", familyId],
    queryFn: () => servicoBeneficios.listar({ family_id: familyId as string }),
    enabled: Boolean(familyId),
    staleTime: 10_000,
  });
}

// ── Grupos / SCFV (Fase 6) ───────────────────────────────────────
export function useGrupos(unitId: string | undefined) {
  return useQuery({
    queryKey: ["grupos", unitId ?? "todos"],
    queryFn: () => servicoGrupos.listar(unitId),
    staleTime: 20_000,
  });
}

export function useGrupo(id: string | undefined) {
  return useQuery({
    queryKey: ["grupo", id],
    queryFn: () => servicoGrupos.obter(id as string),
    enabled: Boolean(id),
  });
}

export function useInscricoes(id: string | undefined) {
  return useQuery({
    queryKey: ["inscricoes", id],
    queryFn: () => servicoGrupos.inscricoes(id as string),
    enabled: Boolean(id),
    staleTime: 10_000,
  });
}

export function useEncontros(id: string | undefined) {
  return useQuery({
    queryKey: ["encontros", id],
    queryFn: () => servicoGrupos.encontros(id as string),
    enabled: Boolean(id),
    staleTime: 10_000,
  });
}

// ── Agenda & Fila do dia (Fase 7) ────────────────────────────────
export function useAgendaSemana(unitId: string | undefined, data?: string) {
  return useQuery({
    queryKey: ["agenda", unitId ?? "todos", data ?? "hoje"],
    queryFn: () => servicoAgenda.listar({ unit_id: unitId as string, data }),
    enabled: Boolean(unitId),
    staleTime: 10_000,
  });
}

export function useFilaDoDia(unitId: string | undefined) {
  return useQuery({
    queryKey: ["fila-dia", unitId ?? "todos"],
    queryFn: () => servicoAgenda.filaDoDia(unitId as string),
    enabled: Boolean(unitId),
    // Fila muda o tempo todo: dados frescos, atualização frequente.
    staleTime: 5_000,
    refetchInterval: 20_000,
  });
}

export function useRecepcaoDoDia(unitId: string | undefined) {
  return useQuery({
    queryKey: ["recepcao-dia", unitId ?? "todos"],
    queryFn: () => servicoRecepcao.filaDoDia(unitId as string),
    enabled: Boolean(unitId),
    staleTime: 5_000,
    refetchInterval: 20_000,
  });
}

// ── Encaminhamentos (Fase 7) ─────────────────────────────────────
export function useEncaminhamentosEnviados(unitId: string | undefined) {
  return useQuery({
    queryKey: ["encaminhamentos", "enviados", unitId ?? "todos"],
    queryFn: () => servicoEncaminhamentos.listar({ unit_id: unitId as string }),
    enabled: Boolean(unitId),
    staleTime: 10_000,
  });
}

export function useEncaminhamentosRecebidos(unitId: string | undefined) {
  return useQuery({
    queryKey: ["encaminhamentos", "recebidos", unitId ?? "todos"],
    queryFn: () => servicoEncaminhamentos.listar({ destino_id: unitId as string }),
    enabled: Boolean(unitId),
    staleTime: 10_000,
  });
}

export function useEncaminhamento(id: string | undefined) {
  return useQuery({
    queryKey: ["encaminhamento", id],
    queryFn: () => servicoEncaminhamentos.obter(id as string),
    enabled: Boolean(id),
  });
}

// ── RMA (Fase 8, §4.8) ───────────────────────────────────────────
/** Calcula (ou devolve o existente) o fechamento do RMA da competência. */
export function useRmaCalculo(
  unitId: string | undefined,
  ano: number,
  mes: number,
) {
  return useQuery({
    queryKey: ["rma", "calculo", unitId ?? "todos", ano, mes],
    queryFn: () => servicoRma.calcular(unitId as string, ano, mes),
    enabled: Boolean(unitId),
    // O RMA é calculado sob demanda; não refaz sozinho durante a conferência.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

/** Detalhe do fechamento (com ajustes) por id. */
export function useRmaDetalhe(id: string | undefined) {
  return useQuery({
    queryKey: ["rma", "detalhe", id],
    queryFn: () => servicoRma.obter(id as string),
    enabled: Boolean(id),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

// ── Dashboard / Vigilância (Fase 8, §4.9) ────────────────────────
export function useDashboardOverview() {
  return useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: () => servicoDashboard.overview(),
    staleTime: 60_000,
  });
}

export function useDashboardSerie(meses = 12) {
  return useQuery({
    queryKey: ["dashboard", "serie", meses],
    queryFn: () => servicoDashboard.serie(meses),
    staleTime: 60_000,
  });
}

export function useDashboardTerritorios() {
  return useQuery({
    queryKey: ["dashboard", "territorios"],
    queryFn: () => servicoDashboard.porTerritorio(),
    staleTime: 60_000,
  });
}

export function useDashboardMapa() {
  return useQuery({
    queryKey: ["dashboard", "mapa"],
    queryFn: () => servicoDashboard.mapa(),
    staleTime: 60_000,
  });
}

export function useDashboardBeneficios(params?: { ano?: number; mes?: number }) {
  return useQuery({
    queryKey: ["dashboard", "beneficios", params?.ano ?? "", params?.mes ?? ""],
    queryFn: () => servicoDashboard.beneficios(params),
    staleTime: 60_000,
  });
}

export function useDashboardIndicadores() {
  return useQuery({
    queryKey: ["dashboard", "indicadores"],
    queryFn: () => servicoDashboard.indicadores(),
    staleTime: 60_000,
  });
}

export function useDashboardActivity(limit = 10) {
  return useQuery({
    queryKey: ["dashboard", "activity", limit],
    queryFn: () => servicoDashboard.activity(limit),
    staleTime: 30_000,
  });
}

// ── Administração / onboarding (Fase 9, §4.10) ───────────────────
export function useOnboardingStatus() {
  return useQuery({
    queryKey: ["onboarding", "status"],
    queryFn: () => servicoAdmin.status(),
    staleTime: 10_000,
  });
}

export function useOrganizationConfig() {
  return useQuery({
    queryKey: ["organizations", "config"],
    queryFn: () => servicoAdmin.config(),
    staleTime: 30 * 60_000,
  });
}

// ── Vigilância Avançada ──────────────────────────────────────
export function useVigilanciaIndicadoresTerritorio(mes: number, ano: number) {
  return useQuery({
    queryKey: ["vigilancia", "indicadores-territorio", mes, ano],
    queryFn: () => servicoVigilanciaAvancada.indicadoresTerritorio(mes, ano),
    staleTime: 60_000,
  });
}

export function useVigilanciaTendencias(meses = 12) {
  return useQuery({
    queryKey: ["vigilancia", "tendencias", meses],
    queryFn: () => servicoVigilanciaAvancada.tendencias(meses),
    staleTime: 60_000,
  });
}

export function useVigilanciaMapaCalor(tipo: "vulnerabilidade" | "densidade" = "vulnerabilidade") {
  return useQuery({
    queryKey: ["vigilancia", "mapa-calor", tipo],
    queryFn: () => servicoVigilanciaAvancada.mapaCalor(tipo),
    staleTime: 60_000,
  });
}

export function useVigilanciaPerfilPopulacional() {
  return useQuery({
    queryKey: ["vigilancia", "perfil-populacional"],
    queryFn: () => servicoVigilanciaAvancada.perfilPopulacional(),
    staleTime: 120_000,
  });
}

export function useVigilanciaAnomalias() {
  return useQuery({
    queryKey: ["vigilancia", "anomalias"],
    queryFn: () => servicoVigilanciaAvancada.anomalias(),
    staleTime: 60_000,
  });
}

// ── Botão do Pânico (Lei Maria da Penha) ──────────────────────────
export function usePanicButtonAtivos() {
  return useQuery({
    queryKey: ["panic-button", "active"],
    queryFn: () => servicoPanicButton.listarAtivos(),
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}

export function usePanicButtonHistorico(limit = 100, offset = 0) {
  return useQuery({
    queryKey: ["panic-button", "history", limit, offset],
    queryFn: () => servicoPanicButton.historico(limit, offset),
    staleTime: 20_000,
  });
}


export function useImportacoes() {
  return useQuery({
    queryKey: ["import-jobs"],
    queryFn: () => servicoAdmin.importacoes(),
    staleTime: 10_000,
  });
}
