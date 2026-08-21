"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { notify } from "@/components/ui/Toast";
import {
  cn,
  formatDate,
  CATEGORIA_DOCUMENTO_LABELS,
  CLASSIFICACAO_LABELS,
} from "@/lib/utils";
import type { Anexo } from "@/types/govtask";
import { Plus, FileText, CheckCircle2, ExternalLink, Download, Trash2, Upload } from "lucide-react";

type Props = { convenioId: string; anexos: Anexo[]; canEdit: boolean; onRefresh: () => void };

const CATEGORIAS = Object.keys(CATEGORIA_DOCUMENTO_LABELS);

export function DocumentosTab({ convenioId, anexos, canEdit, onRefresh }: Props) {
  const [filtro, setFiltro] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    categoria: "OUTROS",
    classificacao: "INTERNO",
    descricao: "",
  });
  const [arquivo, setArquivo] = useState<File | null>(null);

  const adicionar = async () => {
    if (!arquivo) return notify.error("Selecione o arquivo do documento");
    setEnviando(true);
    try {
      // O nome informado vira a descrição do documento quando difere do arquivo.
      const descricao = [form.nome.trim(), form.descricao.trim()].filter(Boolean).join(" — ");
      await api.uploadAnexoAvancado(convenioId, arquivo, {
        tipo_documento: "OUTRO",
        categoria: form.categoria,
        classificacao: form.classificacao,
        descricao: descricao || undefined,
      });
      notify.success("Documento adicionado!");
      setForm({ nome: "", categoria: "OUTROS", classificacao: "INTERNO", descricao: "" });
      setArquivo(null);
      setShowForm(false);
      onRefresh();
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const marcarEnviado = async (a: Anexo) => {
    const protocolo = window.prompt("Número do protocolo no sistema externo:");
    if (!protocolo) return;
    try {
      await api.marcarAnexoEnviadoExterno(a.id, { sistema: "Órgão concedente", protocolo });
      notify.success("Documento marcado como enviado ao órgão externo!");
      onRefresh();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const excluir = async (a: Anexo) => {
    if (!window.confirm("Excluir este documento?")) return;
    try {
      await api.deleteAnexo(a.id);
      notify.success("Documento excluído!");
      onRefresh();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const inputCls =
    "w-full rounded-lg border border-[#E4E7EC] bg-white px-3.5 py-2.5 text-[14px] text-[#101828] placeholder:text-[#98A2B3] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]";
  const labelCls = "block text-[13px] text-[#475467] mb-1.5";

  const visiveis = filtro ? anexos.filter((a) => a.categoria === filtro) : anexos;

  return (
    <div className="space-y-5">
      {/* Filtro por categoria */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
          <Chip label="Todos" ativo={filtro === ""} onClick={() => setFiltro("")} />
          {CATEGORIAS.map((c) => (
            <Chip
              key={c}
              label={CATEGORIA_DOCUMENTO_LABELS[c]}
              ativo={filtro === c}
              onClick={() => setFiltro(c)}
            />
          ))}
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1D4ED8] text-white px-4 py-2.5 text-[13px] font-semibold hover:bg-[#1E40AF] transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" /> Adicionar
          </button>
        )}
      </div>

      {showForm && canEdit && (
        <div className="bg-white border border-[#E4E7EC] rounded-xl p-5">
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Nome *</label>
              <input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex: Projeto Arquitetônico"
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Categoria</label>
                <select
                  value={form.categoria}
                  onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                  className={inputCls}
                >
                  {CATEGORIAS.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORIA_DOCUMENTO_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Visibilidade</label>
                <select
                  value={form.classificacao}
                  onChange={(e) => setForm({ ...form, classificacao: e.target.value })}
                  className={inputCls}
                >
                  {Object.entries(CLASSIFICACAO_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>Descrição</label>
              <input
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Arquivo</label>
              <label className="flex items-center gap-2 rounded-lg border border-dashed border-[#D0D5DD] bg-white px-3.5 py-3 text-[14px] text-[#667085] cursor-pointer hover:border-[#1D4ED8] hover:text-[#1D4ED8] transition-colors">
                <Upload className="w-4 h-4" />
                {arquivo ? arquivo.name : "Selecionar arquivo"}
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => setArquivo(e.target.files?.[0] || null)}
                />
              </label>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 mt-5">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2.5 text-[13px] font-medium text-[#475467] hover:text-[#101828] transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={adicionar}
              disabled={!arquivo || enviando}
              className="rounded-lg bg-[#1D4ED8] text-white px-4 py-2.5 text-[13px] font-semibold hover:bg-[#1E40AF] disabled:bg-[#A4BCFD] disabled:cursor-not-allowed transition-colors"
            >
              Adicionar
            </button>
          </div>
        </div>
      )}

      {visiveis.length === 0 ? (
        <p className="text-[13px] text-[#98A2B3] text-center py-10">
          {filtro ? "Nenhum documento nesta categoria." : "Nenhum documento no processo."}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visiveis.map((a) => (
            <div key={a.id} className="bg-white border border-[#E4E7EC] rounded-xl p-4 flex flex-col">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#F2F4F7] flex items-center justify-center shrink-0">
                  <FileText className="w-[18px] h-[18px] text-[#667085]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-[#101828] truncate" title={a.nome_arquivo}>
                    {a.descricao || a.nome_arquivo}
                  </p>
                  <p className="text-[12px] text-[#98A2B3] mt-0.5">
                    {CATEGORIA_DOCUMENTO_LABELS[a.categoria] || a.categoria} · v{a.versao}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 mt-5 pt-3 border-t border-[#F2F4F7]">
                <span className="text-[12px] text-[#98A2B3] tabular-nums">{formatDate(a.created_at)}</span>
                {a.enviado_externo ? (
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#067647]">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Enviado
                  </span>
                ) : canEdit ? (
                  <button
                    type="button"
                    onClick={() => marcarEnviado(a)}
                    className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#1D4ED8] hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Marcar enviado
                  </button>
                ) : null}
              </div>

              <div className="flex items-center gap-1 mt-2">
                <a
                  href={`/api/govtask/anexos/${a.id}/download`}
                  className="p-1.5 rounded-lg text-[#98A2B3] hover:text-[#1D4ED8] hover:bg-[#1D4ED8]/5 transition-colors"
                  title="Baixar documento"
                >
                  <Download className="w-4 h-4" />
                </a>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => excluir(a)}
                    className="p-1.5 rounded-lg text-[#98A2B3] hover:text-[#B42318] hover:bg-[#B42318]/5 transition-colors"
                    title="Excluir documento"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ label, ativo, onClick }: { label: string; ativo: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-pill px-3 py-1.5 text-[13px] font-medium border transition-colors whitespace-nowrap",
        ativo
          ? "bg-[#101828] text-white border-[#101828]"
          : "bg-white text-[#475467] border-[#E4E7EC] hover:border-[#D0D5DD]"
      )}
    >
      {label}
    </button>
  );
}
