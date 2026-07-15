import { http } from "@/nucleo/http/clienteHttp";
import { ErroApi } from "@/nucleo/http/problemDetails";
import { lerAccessToken } from "@/nucleo/auth/tokenStorage";
import type {
  ImportJobOut,
  ImportResultOut,
  OrganizationConfig,
  TenantOnboardingStatus,
  WizardStepResult,
} from "@/tipos/admin";

/**
 * Serviços da Administração do tenant (Fase 9, §4.10).
 * O wizard executa uma etapa por vez (`POST /onboarding/wizard/{step}` com
 * corpo `{ data }`). A importação do CadÚnico é multipart (FormData) — enviada
 * por um fetch dedicado, pois o cliente HTTP padrão serializa JSON.
 */
const BASE = import.meta.env.VITE_API_URL || "/api/govsocial/v1";

export const servicoAdmin = {
  status: () => http.get<TenantOnboardingStatus>("/onboarding/status"),

  config: () => http.get<OrganizationConfig>("/organizations/config"),

  executarEtapa: (step: string, data: Record<string, unknown>) =>
    http.post<WizardStepResult>(`/onboarding/wizard/${step}`, { data }),

  importacoes: () => http.get<ImportJobOut[]>("/import-jobs"),

  obterImportacao: (id: string) => http.get<ImportResultOut>(`/import-jobs/${id}`),

  /** Upload multipart do CSV do CadÚnico. */
  uploadCadunico: async (arquivo: File): Promise<ImportResultOut> => {
    const form = new FormData();
    form.append("file", arquivo);
    const token = lerAccessToken();
    const resp = await fetch(`${BASE}/import-jobs/cadunico/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });
    if (!resp.ok) {
      // Reaproveita o tratamento de erro padrão (RFC 9457 → pt-BR).
      const problema = await resp
        .json()
        .catch(() => ({ type: "about:blank", title: resp.statusText, status: resp.status }));
      throw new ErroApi(problema);
    }
    return (await resp.json()) as ImportResultOut;
  },
};
