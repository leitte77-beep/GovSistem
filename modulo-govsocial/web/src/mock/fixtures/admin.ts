import type {
  ImportJobOut,
  ImportLogItem,
  ImportResultOut,
  TenantOnboardingStatus,
} from "@/tipos/admin";
import { TENANT } from "./novaEsperanca";

/**
 * Store dinâmico da Administração (Fase 9, §4.10).
 * O status do onboarding começa com nenhuma etapa concluída, para que o e2e
 * percorra o wizard e veja as etapas sendo marcadas. Cada `executarEtapa`
 * marca a etapa correspondente como concluída.
 */

type EtapaBackend = "units" | "territories" | "benefits" | "professionals" | "import";

const ORDEM_BACKEND: EtapaBackend[] = [
  "units",
  "territories",
  "benefits",
  "professionals",
  "import",
];

let concluidas: Set<EtapaBackend>;
let jobs: ImportJobOut[];
let logsPorJob: Map<string, ImportLogItem[]>;
let seq = 1;

export function resetarAdmin() {
  concluidas = new Set();
  jobs = [];
  logsPorJob = new Map();
  seq = 1;
}
resetarAdmin();

export function statusOnboarding(): TenantOnboardingStatus {
  const steps = ORDEM_BACKEND.map((step) => ({
    step,
    completed: concluidas.has(step),
  }));
  return {
    tenant_id: TENANT.id,
    tenant_name: TENANT.nomeMunicipio,
    steps,
    ready: steps.every((s) => s.completed),
  };
}

export function executarEtapa(
  step: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (ORDEM_BACKEND.includes(step as EtapaBackend)) {
    concluidas.add(step as EtapaBackend);
  }

  if (step === "units") {
    const unidades = Array.isArray(data.unidades) ? data.unidades : [];
    return { step, created: unidades.length };
  }
  if (step === "territories") {
    return { step, added: (data.nome as string) ?? null };
  }
  if (step === "benefits") {
    return { step, seeded: { benefit_types: 6 } };
  }
  if (step === "professionals") {
    const profs = Array.isArray(data.professionals) ? data.professionals : [];
    return { step, created: profs.length };
  }
  if (step === "import") {
    return { step, redirect: "/api/govsocial/v1/import-jobs/cadunico/upload" };
  }
  return { step, status: "unknown_step" };
}

export function listarImportacoes(): ImportJobOut[] {
  return [...jobs].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export function obterImportacao(id: string): ImportResultOut | null {
  const job = jobs.find((j) => j.id === id);
  if (!job) return null;
  return {
    job,
    summary: {
      novos: job.novos ?? 0,
      atualizados: job.atualizados ?? 0,
      conflitos: job.conflitos ?? 0,
      erros: job.erros ?? 0,
    },
    logs: logsPorJob.get(id) ?? [],
  };
}

/** Processa o CSV enviado: gera contadores e logs determinísticos. */
export function processarUpload(
  nomeArquivo: string,
  conteudo: string,
): ImportResultOut {
  const linhas = conteudo
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  // Considera a primeira linha como cabeçalho.
  const dados = linhas.slice(1);
  const total = dados.length;

  // Distribuição determinística: 60% novos, 25% atualizados, 10% conflitos, 5% erros.
  const novos = Math.round(total * 0.6);
  const atualizados = Math.round(total * 0.25);
  const conflitos = Math.round(total * 0.1);
  const erros = Math.max(0, total - novos - atualizados - conflitos);

  const agora = new Date().toISOString();
  const id = `import-${(seq++).toString(36)}-${Date.now().toString(36)}`;

  const job: ImportJobOut = {
    id,
    tipo: "CADUNICO",
    status: "CONCLUIDO",
    nome_arquivo: nomeArquivo,
    total_linhas: total,
    linhas_processadas: total,
    novos,
    atualizados,
    conflitos,
    erros,
    criado_por_id: "user-admin",
    created_at: agora,
    updated_at: agora,
  };
  jobs.push(job);

  // Logs de amostra (sem PII real — NIS/CPF mascarados).
  const amostra: ImportLogItem[] = dados.slice(0, 6).map((_, i) => {
    const status =
      i < novos
        ? "NOVO"
        : i < novos + atualizados
          ? "ATUALIZADO"
          : i < novos + atualizados + conflitos
            ? "CONFLITO"
            : "ERRO";
    return {
      id: `log-${id}-${i}`,
      linha: i + 2,
      status,
      nis: "********" + String(100 + i).slice(-3),
      cpf: "***.***.***-" + String(10 + i).slice(-2),
      nome: null,
      mensagem:
        status === "CONFLITO"
          ? "NIS já vinculado a outra família."
          : status === "ERRO"
            ? "Campo obrigatório ausente."
            : null,
      family_id_match: null,
      created_at: agora,
    };
  });
  logsPorJob.set(id, amostra);

  return obterImportacao(id) as ImportResultOut;
}
