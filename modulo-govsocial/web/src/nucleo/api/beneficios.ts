import { http } from "@/nucleo/http/clienteHttp";
import type { BenefitTypeOut } from "@/tipos/dominios";
import type {
  ConcessaoCreate,
  ConcessaoListItem,
  ConcessaoOut,
} from "@/tipos/beneficios";

/**
 * Serviços de benefícios eventuais (Fase 5).
 * A entrega e as transições críticas usam chave de idempotência (§14).
 * O parecer é sensível: buscado sob demanda no detalhe (semCache).
 */
export const servicoBeneficios = {
  tipos: () => http.get<BenefitTypeOut[]>("/benefit-types"),

  listar: (params: { family_id?: string; unit_id?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params.family_id) qs.set("family_id", params.family_id);
    if (params.unit_id) qs.set("unit_id", params.unit_id);
    if (params.status) qs.set("status", params.status);
    const q = qs.toString();
    return http.get<ConcessaoListItem[]>(`/benefit-concessions${q ? `?${q}` : ""}`);
  },

  obter: (id: string) =>
    http.get<ConcessaoOut>(`/benefit-concessions/${id}`, { semCache: true }),

  criar: (corpo: ConcessaoCreate, chaveIdempotencia: string) =>
    http.post<ConcessaoOut>("/benefit-concessions", corpo, { chaveIdempotencia }),

  emitirParecer: (id: string, parecer: string | null) =>
    http.post<ConcessaoOut>(`/benefit-concessions/${id}/analyze`, { parecer }),

  aprovar: (id: string) =>
    http.post<ConcessaoOut>(`/benefit-concessions/${id}/approve`, {}),

  negar: (id: string, motivo: string) =>
    http.post<ConcessaoOut>(`/benefit-concessions/${id}/deny`, { motivo_negacao: motivo }),

  entregar: (id: string, chaveIdempotencia: string) =>
    http.post<ConcessaoOut>(`/benefit-concessions/${id}/deliver`, {}, { chaveIdempotencia }),
};
