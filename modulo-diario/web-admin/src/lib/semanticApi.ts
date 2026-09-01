/**
 * API client for the semantic document engine and template builder
 * (backend: api/app/api/v1/semantic.py). Feature-flagged server-side.
 */
import { api } from "./api";
import type {
  SemanticAnalyzeResponse,
  SemanticDocument,
  SemanticSaveResponse,
  Template,
  TemplateConfig,
} from "@/types/semantic";

export const semanticApi = {
  analyze(
    matterId: string,
    body: {
      html?: string | null;
      plain?: string | null;
      title?: string;
      summary?: string;
      document_type?: string;
    }
  ): Promise<SemanticAnalyzeResponse> {
    return api.post<SemanticAnalyzeResponse>(
      `/matters/${matterId}/semantic/analyze`,
      body
    );
  },

  save(
    matterId: string,
    body: {
      document: SemanticDocument;
      template_id?: string | null;
      template_version?: number | null;
      confirm_all?: boolean;
    },
    expectedVersion?: number
  ): Promise<SemanticSaveResponse & { version?: number; etag?: string; content_mode?: string }> {
    // Fase 2 — conflito otimista: envia If-Match com a versão lida; o servidor
    // responde 409 se a matéria mudou desde a última leitura.
    const headers = expectedVersion ? { "If-Match": String(expectedVersion) } : undefined;
    return api.put<SemanticSaveResponse & { version?: number; etag?: string; content_mode?: string }>(
      `/matters/${matterId}/semantic`,
      body,
      headers
    );
  },

  get(matterId: string): Promise<{
    document: SemanticDocument;
    classification_status: string;
    template_id?: string | null;
    template_version?: number | null;
    content_mode?: string;
    version?: number;
    etag?: string;
  }> {
    return api.getRaw(`/matters/${matterId}/semantic`);
  },

  // Templates
  listTemplates(): Promise<Template[]> {
    return api.getRaw("/templates");
  },

  createTemplate(data: { name: string; slug: string; document_type: string }): Promise<Template> {
    return api.post<Template>("/templates", data);
  },

  createTemplateVersion(
    templateId: string,
    data: { config: TemplateConfig; change_reason?: string | null }
  ): Promise<Template> {
    return api.post<Template>(`/templates/${templateId}/versions`, data);
  },

  activateTemplateVersion(
    templateId: string,
    data: { version_number: number; reason?: string }
  ): Promise<Template> {
    return api.post<Template>(`/templates/${templateId}/activate`, data);
  },
};
