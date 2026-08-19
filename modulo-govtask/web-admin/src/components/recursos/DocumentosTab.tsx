"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FileUpload } from "@/components/ui/FileUpload";
import { EmptyState } from "@/components/ui/EmptyState";
import { notify } from "@/components/ui/Toast";
import { formatDate, formatFileSize, CATEGORIA_DOCUMENTO_LABELS, CLASSIFICACAO_LABELS, TIPO_DOCUMENTO_LABELS, RECURSOS_STATUS_COLORS } from "@/lib/utils";
import type { Anexo } from "@/types/govtask";
import { Download, X, Send, FileText } from "lucide-react";

type Props = { convenioId: string; anexos: Anexo[]; canEdit: boolean; onRefresh: () => void };

const CATEGORIAS = Object.keys(CATEGORIA_DOCUMENTO_LABELS);

export function DocumentosTab({ convenioId, anexos, canEdit, onRefresh }: Props) {
  const [categoria, setCategoria] = useState("OUTROS");
  const [classificacao, setClassificacao] = useState("INTERNO");
  const [descricao, setDescricao] = useState("");

  const handleUpload = async (file: File): Promise<void> => {
    try {
      await api.uploadAnexoAvancado(convenioId, file, {
        tipo_documento: "OUTRO",
        categoria,
        classificacao,
        descricao: descricao || undefined,
      });
      notify.success("Documento enviado!");
      setDescricao("");
      onRefresh();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const marcarEnviadoExterno = async (a: Anexo) => {
    const protocolo = window.prompt("Número do protocolo no sistema externo:");
    if (!protocolo) return;
    try {
      await api.marcarAnexoEnviadoExterno(a.id, {
        sistema: "Órgão concedente",
        protocolo,
      });
      notify.success("Documento marcado como enviado ao órgão externo!");
      onRefresh();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const excluir = async (id: string) => {
    if (!window.confirm("Excluir este documento?")) return;
    try {
      await api.deleteAnexo(id);
      notify.success("Documento excluído!");
      onRefresh();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const inputCls = "border border-surface-border rounded-btn px-2 py-1 text-meta bg-white";

  return (
    <div className="space-y-6">
      {canEdit && (
        <Card padding="p-4">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <h3 className="text-label font-medium text-text-title">Enviar Documento</h3>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={inputCls}>
              {CATEGORIAS.map((c) => <option key={c} value={c}>{CATEGORIA_DOCUMENTO_LABELS[c]}</option>)}
            </select>
            <select value={classificacao} onChange={(e) => setClassificacao(e.target.value)} className={inputCls}>
              {Object.entries(CLASSIFICACAO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descrição (opcional)"
              className={`${inputCls} flex-1 min-w-[180px]`}
            />
          </div>
          <FileUpload onUpload={handleUpload} multiple={false} />
        </Card>
      )}

      {anexos.length === 0 ? (
        <EmptyState icon="file-text" title="Nenhum documento" description="Envie documentos para compor a biblioteca oficial do processo." />
      ) : (
        <div className="space-y-4">
          {CATEGORIAS.filter((cat) => anexos.some((a) => a.categoria === cat)).map((cat) => {
            const docs = anexos.filter((a) => a.categoria === cat);
            return (
              <Card key={cat} padding="p-4">
                <h3 className="text-label font-medium text-text-title mb-3">
                  {CATEGORIA_DOCUMENTO_LABELS[cat]} <span className="text-text-subtle">({docs.length})</span>
                </h3>
                <div className="space-y-2">
                  {docs.map((a) => (
                    <div key={a.id} className="flex items-center justify-between p-2 rounded-btn hover:bg-[#F6F7F9] transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="w-5 h-5 text-text-subtle shrink-0" />
                        <div className="min-w-0">
                          <p className="text-body-sm font-medium text-text-title truncate">{a.nome_arquivo}</p>
                          <div className="flex items-center gap-2 text-meta text-text-subtle mt-0.5 flex-wrap">
                            <Badge label={`v${a.versao}`} color="bg-[#F6F7F9] text-[#667085]" />
                            {a.tipo_documento && <Badge label={TIPO_DOCUMENTO_LABELS[a.tipo_documento] || a.tipo_documento} color="bg-[#F6F7F9] text-[#667085]" />}
                            <Badge label={CLASSIFICACAO_LABELS[a.classificacao] || a.classificacao} color={RECURSOS_STATUS_COLORS[a.classificacao] || "bg-[#F6F7F9] text-[#667085]"} />
                            <span>{formatFileSize(a.tamanho_bytes)}</span>
                            <span>{formatDate(a.created_at)}</span>
                          </div>
                          {a.descricao && <p className="text-meta text-text-body mt-0.5">{a.descricao}</p>}
                          {a.enviado_externo && (
                            <p className="text-meta text-[#067647] font-medium mt-0.5">
                              ✓ Enviado ao órgão externo{a.enviado_externo_protocolo ? ` — protocolo ${a.enviado_externo_protocolo}` : ""}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <a href={`/api/govtask/anexos/${a.id}/download`} className="p-1.5 text-text-subtle hover:text-[#1D4ED8] rounded-btn hover:bg-[#1D4ED8]/10 transition-colors" title="Download">
                          <Download className="w-4 h-4" />
                        </a>
                        {canEdit && !a.enviado_externo && (
                          <button onClick={() => marcarEnviadoExterno(a)} className="p-1.5 text-text-subtle hover:text-[#067647] rounded-btn hover:bg-[#067647]/10 transition-colors" title="Marcar enviado ao órgão externo">
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                        {canEdit && (
                          <button onClick={() => excluir(a.id)} className="p-1.5 text-text-subtle hover:text-[#B42318] rounded-btn hover:bg-[#B42318]/10 transition-colors" title="Excluir">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
