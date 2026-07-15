import { z } from "zod";
import type {
  ImportJobOut,
  TenantOnboardingStatus,
} from "@/tipos/admin";
import { validarCpf } from "@/nucleo/validadoresBr";

/**
 * Modelo puro do assistente de implantação (§4.10) — funções e schemas
 * testáveis, sem React. As etapas visíveis são 6; cinco delas correspondem a
 * etapas do backend (units, territories, professionals, benefits, import) e uma
 * (sigilo) é uma confirmação local.
 */

export type EtapaWizard = {
  id: string;
  rotulo: string;
  /** Nome da etapa no backend (null para a etapa local de sigilo). */
  backend: string | null;
  descricao: string;
};

export const ETAPAS_WIZARD: EtapaWizard[] = [
  {
    id: "units",
    rotulo: "Unidades",
    backend: "units",
    descricao: "Cadastre as unidades de atendimento (CRAS, CREAS, Centro POP).",
  },
  {
    id: "territories",
    rotulo: "Territórios",
    backend: "territories",
    descricao: "Defina os territórios e associe as unidades responsáveis.",
  },
  {
    id: "professionals",
    rotulo: "Equipes e lotações",
    backend: "professionals",
    descricao: "Cadastre os profissionais e suas funções.",
  },
  {
    id: "benefits",
    rotulo: "Tipos de benefício",
    backend: "benefits",
    descricao: "Semeie os tipos nacionais de benefício eventual.",
  },
  {
    id: "sigilo",
    rotulo: "Parâmetros de sigilo",
    backend: null,
    descricao: "Escolha o sigilo padrão dos atendimentos da rede.",
  },
  {
    id: "import",
    rotulo: "Importação CadÚnico",
    backend: "import",
    descricao: "Importe a base do CadÚnico e concilie com o cadastro.",
  },
];

// ── Schemas de validação (Zod) ───────────────────────────────────
export const esquemaUnidade = z.object({
  tipo: z.string().min(1, "Escolha o tipo"),
  nome: z.string().trim().min(2, "Informe o nome da unidade"),
  bairro: z.string().trim().optional().or(z.literal("")),
  municipio: z.string().trim().optional().or(z.literal("")),
  uf: z
    .string()
    .trim()
    .length(2, "UF deve ter 2 letras")
    .optional()
    .or(z.literal("")),
});
export type FormUnidade = z.infer<typeof esquemaUnidade>;

export const esquemaTerritorio = z.object({
  nome: z.string().trim().min(2, "Informe o nome do território"),
  unidades: z.array(z.string()).min(1, "Selecione ao menos uma unidade"),
});
export type FormTerritorio = z.infer<typeof esquemaTerritorio>;

export const esquemaProfissional = z
  .object({
    nome: z.string().trim().min(2, "Informe o nome"),
    funcao: z.string().trim().optional().or(z.literal("")),
    cpf: z.string().trim().optional().or(z.literal("")),
    email: z
      .string()
      .trim()
      .email("E-mail inválido")
      .optional()
      .or(z.literal("")),
    telefone: z.string().trim().optional().or(z.literal("")),
  })
  .refine((v) => !v.cpf || validarCpf(v.cpf), {
    message: "CPF inválido",
    path: ["cpf"],
  });
export type FormProfissional = z.infer<typeof esquemaProfissional>;

// ── Helpers de status ────────────────────────────────────────────
export function etapaConcluida(
  status: TenantOnboardingStatus | undefined,
  backend: string | null,
): boolean {
  if (!status) return false;
  if (!backend) return true; // etapa local (sigilo) não depende do backend
  return status.steps.some((s) => s.step === backend && s.completed);
}

/** Todas as etapas do backend concluídas → tenant pronto. */
export function calcularPronto(steps: { step: string; completed: boolean }[]): boolean {
  return steps.length > 0 && steps.every((s) => s.completed);
}

/** Índice da primeira etapa (visível) ainda pendente; 0 se todas prontas. */
export function proximaEtapaPendente(
  status: TenantOnboardingStatus | undefined,
): number {
  const idx = ETAPAS_WIZARD.findIndex((e) => !etapaConcluida(status, e.backend));
  return idx < 0 ? 0 : idx;
}

export type ResumoConciliacao = {
  novos: number;
  atualizados: number;
  conflitos: number;
  erros: number;
  total: number;
};

/** Resumo da conciliação de importação (novos/atualizados/conflitos/erros). */
export function resumoConciliacao(job: ImportJobOut): ResumoConciliacao {
  const novos = job.novos ?? 0;
  const atualizados = job.atualizados ?? 0;
  const conflitos = job.conflitos ?? 0;
  const erros = job.erros ?? 0;
  return {
    novos,
    atualizados,
    conflitos,
    erros,
    total: novos + atualizados + conflitos + erros,
  };
}

export const TIPOS_UNIDADE = [
  { valor: "CRAS", rotulo: "CRAS" },
  { valor: "CREAS", rotulo: "CREAS" },
  { valor: "CENTRO_POP", rotulo: "Centro POP" },
  { valor: "SEDE", rotulo: "Secretaria (SEDE)" },
];
