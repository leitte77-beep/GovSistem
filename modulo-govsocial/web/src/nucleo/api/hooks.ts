import { useQuery } from "@tanstack/react-query";
import { servicoBusca, servicoFamilias, servicoPessoas } from "@/nucleo/api/pessoas";
import { servicoBeneficios } from "@/nucleo/api/beneficios";
import { servicoGrupos } from "@/nucleo/api/grupos";
import { servicoAgenda } from "@/nucleo/api/agenda";
import { servicoEncaminhamentos } from "@/nucleo/api/encaminhamentos";
import { servicoProntuario } from "@/nucleo/api/prontuario";
import { servicoRma } from "@/nucleo/api/rma";
import { servicoDashboard } from "@/nucleo/api/dashboard";
import { servicoAdmin } from "@/nucleo/api/admin";
import { servicoDominios } from "@/nucleo/api/atendimento";

/**
 * Hooks de dados (TanStack Query) — um bloco por fase (padrão do projeto).
 * As chaves de query seguem as invalidações já usadas pelas mutações.
 */

// ── Busca (Fase 2) ──────────────────────────────────────────────────────
export function useBuscaUnificada(termo: string) {
  return useQuery({
    queryKey: ["busca", termo],
    queryFn: ({ signal }) => servicoBusca.unificada(termo, signal),
    enabled: termo.trim().length >= 2,
  });
}

// ── Famílias e pessoas (Fase 2) ─────────────────────────────────────────
export function useFamilias(params?: { search?: string; territorio?: string }) {
  return useQuery({
    queryKey: ["familias", params?.search ?? "", params?.territorio ?? ""],
    queryFn: () => servicoFamilias.listar(params),
  });
}

export function useFamilia(id?: string) {
  return useQuery({
    queryKey: ["familia", id],
    queryFn: () => servicoFamilias.obter(id as string),
    enabled: !!id,
  });
}

export function usePessoas() {
  return useQuery({ queryKey: ["pessoas"], queryFn: () => servicoPessoas.listar() });
}

// ── Prontuário (Fase 3) ─────────────────────────────────────────────────
export function useProntuariosDaFamilia(id?: string) {
  return useQuery({
    queryKey: ["prontuarios", id],
    queryFn: () => servicoProntuario.listarPorFamilia(id as string),
    enabled: !!id,
    staleTime: 20_000,
  });
}

export function useProntuariosDaUnidade(unitId?: string) {
  return useQuery({
    queryKey: ["case-files", unitId ?? "todos"],
    queryFn: () => servicoProntuario.listarPorUnidade(unitId),
    staleTime: 20_000,
  });
}

export function useVisaoDeRede(familyId?: string) {
  return useQuery({
    queryKey: ["rede", familyId],
    queryFn: () => servicoProntuario.visaoDeRede(familyId as string),
    enabled: !!familyId,
  });
}

// ── Atendimento (Fase 4) ────────────────────────────────────────────────
export function useTiposServico() {
  return useQuery({
    queryKey: ["service-types"],
    queryFn: () => servicoDominios.serviceTypes(),
    staleTime: 60_000,
  });
}

// ── Benefícios (Fase 5) ─────────────────────────────────────────────────
export function useTiposBeneficio() {
  return useQuery({
    queryKey: ["benefit-types"],
    queryFn: () => servicoBeneficios.tipos(),
    staleTime: 60_000,
  });
}

export function useConcessoesDaFamilia(familyId?: string) {
  return useQuery({
    queryKey: ["concessoes", familyId],
    queryFn: () => servicoBeneficios.listar({ family_id: familyId as string }),
    enabled: !!familyId,
  });
}

// ── Grupos / SCFV (Fase 6) ──────────────────────────────────────────────
export function useGrupos(unitId?: string) {
  return useQuery({
    queryKey: ["grupos", unitId ?? "todos"],
    queryFn: () => servicoGrupos.listar(unitId),
  });
}

export function useGrupo(id?: string) {
  return useQuery({
    queryKey: ["grupo", id],
    queryFn: () => servicoGrupos.obter(id as string),
    enabled: !!id,
  });
}

export function useInscricoes(grupoId?: string) {
  return useQuery({
    queryKey: ["inscricoes", grupoId],
    queryFn: () => servicoGrupos.inscricoes(grupoId as string),
    enabled: !!grupoId,
  });
}

export function useEncontros(grupoId?: string) {
  return useQuery({
    queryKey: ["encontros", grupoId],
    queryFn: () => servicoGrupos.encontros(grupoId as string),
    enabled: !!grupoId,
  });
}

// ── Agenda e fila (Fase 7) ──────────────────────────────────────────────
export function useAgendaSemana(unitId?: string) {
  return useQuery({
    queryKey: ["agenda", unitId ?? "todos"],
    queryFn: () => servicoAgenda.listar({ unit_id: unitId as string }),
    enabled: !!unitId,
  });
}

export function useFilaDoDia(unitId?: string) {
  return useQuery({
    queryKey: ["fila-dia", unitId ?? "todos"],
    queryFn: () => servicoAgenda.filaDoDia(unitId as string),
    enabled: !!unitId,
    refetchInterval: 30_000,
  });
}

// ── Encaminhamentos (Fase 7) ────────────────────────────────────────────
export function useEncaminhamentosEnviados(unitId?: string) {
  return useQuery({
    queryKey: ["encaminhamentos", "enviados", unitId ?? "todos"],
    queryFn: () => servicoEncaminhamentos.listar({ unit_id: unitId }),
    enabled: !!unitId,
  });
}

export function useEncaminhamentosRecebidos(unitId?: string) {
  return useQuery({
    queryKey: ["encaminhamentos", "recebidos", unitId ?? "todos"],
    queryFn: () => servicoEncaminhamentos.listar({ destino_id: unitId }),
    enabled: !!unitId,
  });
}

export function useEncaminhamento(id?: string) {
  return useQuery({
    queryKey: ["encaminhamento", id],
    queryFn: () => servicoEncaminhamentos.obter(id as string),
    enabled: !!id,
  });
}

// ── RMA (Fase 8) ────────────────────────────────────────────────────────
export function useRmaCalculo(unitId?: string, ano?: number, mes?: number) {
  return useQuery({
    queryKey: ["rma", "calculo", unitId, ano, mes],
    queryFn: () => servicoRma.calcular(unitId as string, ano as number, mes as number),
    enabled: !!unitId && !!ano && !!mes,
  });
}

export function useRmaDetalhe(id?: string) {
  return useQuery({
    queryKey: ["rma", "detalhe", id],
    queryFn: () => servicoRma.obter(id as string),
    enabled: !!id,
  });
}

// ── Dashboard / vigilância (Fase 8) ─────────────────────────────────────
export function useDashboardOverview() {
  return useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: () => servicoDashboard.overview(),
  });
}

export function useDashboardSerie(meses = 12) {
  return useQuery({
    queryKey: ["dashboard", "serie", meses],
    queryFn: () => servicoDashboard.serie(meses),
  });
}

export function useDashboardBeneficios() {
  return useQuery({
    queryKey: ["dashboard", "beneficios"],
    queryFn: () => servicoDashboard.beneficios(),
  });
}

export function useDashboardMapa() {
  return useQuery({
    queryKey: ["dashboard", "mapa"],
    queryFn: () => servicoDashboard.mapa(),
  });
}

export function useDashboardIndicadores() {
  return useQuery({
    queryKey: ["dashboard", "indicadores"],
    queryFn: () => servicoDashboard.indicadores(),
  });
}

export function useDashboardTerritorios() {
  return useQuery({
    queryKey: ["dashboard", "territorios"],
    queryFn: () => servicoDashboard.porTerritorio(),
  });
}

// ── Administração / onboarding (Fase 9) ─────────────────────────────────
export function useOnboardingStatus() {
  return useQuery({
    queryKey: ["onboarding", "status"],
    queryFn: () => servicoAdmin.status(),
  });
}

export function useOrganizationConfig() {
  return useQuery({
    queryKey: ["organizacao", "config"],
    queryFn: () => servicoAdmin.config(),
    staleTime: 300_000,
  });
}

// ── Recomendações da tela inicial (contadores agregados do tenant) ──────
export function useRecommendationScope() {
  return useQuery({
    queryKey: ["dashboard", "recommendation-scope"],
    queryFn: () => servicoDashboard.escopoRecomendacoes(),
    staleTime: 60_000,
  });
}
