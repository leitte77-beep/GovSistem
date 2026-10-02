"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import {
  AlertTriangle, CalendarClock, ClipboardList, Download, Eye, FileBadge, FileCheck2, FileText, FolderOpen, Image as ImageIcon,
  Landmark, Loader2, Pencil, Plus, Receipt, ShieldCheck, Trash2, UploadCloud, X,
} from "lucide-react";
import { api, DocumentoVeiculo } from "@/lib/api";

/** Documentos do veículo: CRLV, seguro, IPVA, notas de manutenção, solicitações… com o arquivo anexado. */

type Tipo = "CRLV" | "SEGURO" | "IPVA" | "NF_MANUTENCAO" | "SOLICITACAO" | "VISTORIA" | "MULTA" | "OUTRO";

const TIPOS: Record<Tipo, { rotulo: string; icone: typeof FileText; cor: string; vence: boolean }> = {
  CRLV: { rotulo: "CRLV", icone: FileBadge, cor: "bg-[#E5EEFF] text-[#1D4ED8]", vence: true },
  SEGURO: { rotulo: "Seguro", icone: ShieldCheck, cor: "bg-[#E7F8EC] text-[#106D34]", vence: true },
  IPVA: { rotulo: "IPVA / Licenciamento", icone: Landmark, cor: "bg-[#F4EBFF] text-[#6941C6]", vence: true },
  NF_MANUTENCAO: { rotulo: "Nota de manutenção", icone: Receipt, cor: "bg-[#FFF4D6] text-[#92400E]", vence: false },
  SOLICITACAO: { rotulo: "Solicitação", icone: ClipboardList, cor: "bg-[#E0F2FE] text-[#0369A1]", vence: false },
  VISTORIA: { rotulo: "Vistoria / Laudo", icone: FileCheck2, cor: "bg-[#CCFBF1] text-[#0F766E]", vence: true },
  MULTA: { rotulo: "Multa / Notificação", icone: AlertTriangle, cor: "bg-[#FEE4E2] text-[#B42318]", vence: true },
  OUTRO: { rotulo: "Outro", icone: FileText, cor: "bg-[#F1F4F9] text-[#475467]", vence: false },
};
const tipoDe = (t: string | null | undefined): Tipo => (t && t in TIPOS ? (t as Tipo) : "OUTRO");

const ACEITOS = ".pdf,.jpg,.jpeg,.png,.webp";
const hoje = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const diasAte = (v: string) => Math.round((new Date(`${v}T00:00`).getTime() - hoje().getTime()) / 86400000);
const dataBr = (v: string) => new Date(v.length === 10 ? `${v}T12:00` : v).toLocaleDateString("pt-BR");
const tamanho = (b?: number | null) => (b == null ? "" : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);

function SeloVencimento({ v }: { v: string | null }) {
  if (!v) return null;
  const d = diasAte(v);
  const [cls, txt] = d < 0
    ? ["bg-[#FEE4E2] text-[#B42318]", `Vencido há ${-d} dia(s)`]
    : d <= 30
      ? ["bg-[#FFF4D6] text-[#92400E]", d === 0 ? "Vence hoje" : `Vence em ${d} dia(s)`]
      : ["bg-[#E7F8EC] text-[#106D34]", `Válido até ${dataBr(v)}`];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}><CalendarClock size={11} /> {txt}</span>;
}

export default function DocumentosVeiculo({ veiculoId, documentos, podeEditar, onMudou }: {
  veiculoId: string; documentos: DocumentoVeiculo[]; podeEditar: boolean; onMudou: () => void;
}) {
  const [filtro, setFiltro] = useState<Tipo | "">("");
  const [form, setForm] = useState<DocumentoVeiculo | "novo" | null>(null);

  const contagem = useMemo(() => {
    const c: Partial<Record<Tipo, number>> = {};
    for (const d of documentos) c[tipoDe(d.tipo)] = (c[tipoDe(d.tipo)] ?? 0) + 1;
    return c;
  }, [documentos]);
  const vencidos = documentos.filter((d) => d.vencimento && diasAte(d.vencimento) < 0).length;
  const aVencer = documentos.filter((d) => d.vencimento && diasAte(d.vencimento) >= 0 && diasAte(d.vencimento) <= 30).length;
  const visiveis = filtro ? documentos.filter((d) => tipoDe(d.tipo) === filtro) : documentos;

  const arquivo = (d: DocumentoVeiculo) => ({ url: `/api/govfrota/uploads/${d.anexo_id}`, nome: d.arquivo_nome ?? d.descricao, mime: d.arquivo_mime });
  const abrir = (d: DocumentoVeiculo) => api.abrirAnexo(arquivo(d)).catch((e) => toast.error((e as Error).message));
  const baixar = (d: DocumentoVeiculo) => api.baixarAnexo(arquivo(d)).catch((e) => toast.error((e as Error).message));
  const excluir = async (d: DocumentoVeiculo) => {
    if (!window.confirm(`Excluir "${d.descricao}"? O arquivo deixa de aparecer no veículo.`)) return;
    try {
      await api.excluirDocumento(veiculoId, d.id);
      toast.success("Documento excluído.");
      onMudou();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-body-sm">
          <span className="font-semibold text-text-title">{documentos.length} documento(s)</span>
          {vencidos > 0 && <span className="rounded-full bg-[#FEE4E2] px-2.5 py-0.5 text-xs font-semibold text-[#B42318]">{vencidos} vencido(s)</span>}
          {aVencer > 0 && <span className="rounded-full bg-[#FFF4D6] px-2.5 py-0.5 text-xs font-semibold text-[#92400E]">{aVencer} vence(m) em 30 dias</span>}
        </div>
        {podeEditar && (
          <button className="btn btn-primary btn-sm" onClick={() => setForm("novo")}><Plus size={15} /> Adicionar documento</button>
        )}
      </div>

      {documentos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFiltro("")}
            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${!filtro ? "bg-[#1D5BD6] text-white ring-[#1D5BD6]" : "bg-white text-text-body ring-outline-variant/60 hover:bg-[#F3F7FF]"}`}>
            Todos
          </button>
          {(Object.keys(TIPOS) as Tipo[]).filter((t) => contagem[t]).map((t) => (
            <button key={t} onClick={() => setFiltro(t)}
              className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${filtro === t ? "bg-[#1D5BD6] text-white ring-[#1D5BD6]" : "bg-white text-text-body ring-outline-variant/60 hover:bg-[#F3F7FF]"}`}>
              {TIPOS[t].rotulo} · {contagem[t]}
            </button>
          ))}
        </div>
      )}

      {documentos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-outline-variant bg-surface-card px-4 py-14 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E5EEFF] text-[#1D4ED8]"><FolderOpen size={26} /></span>
          <p className="font-medium text-text-title">Nenhum documento deste veículo</p>
          <p className="max-w-md text-body-sm text-text-subtle">Guarde aqui o CRLV, a apólice do seguro, o IPVA, as notas de manutenção e as solicitações. Documentos com vencimento geram alerta antes de vencer.</p>
          {podeEditar && <button className="btn btn-primary btn-sm mt-2" onClick={() => setForm("novo")}><UploadCloud size={15} /> Enviar o primeiro documento</button>}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visiveis.map((d) => {
            const m = TIPOS[tipoDe(d.tipo)];
            const imagem = d.arquivo_mime?.startsWith("image/");
            return (
              <div key={d.id} className="group flex flex-col rounded-2xl border border-outline-variant/50 bg-surface-card p-4 shadow-sm transition hover:shadow-md">
                <div className="flex items-start gap-3">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${m.cor}`}><m.icone size={18} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-text-subtle">{m.rotulo}</p>
                    <p className="truncate font-semibold text-text-title" title={d.descricao}>{d.descricao}</p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5"><SeloVencimento v={d.vencimento} /></div>
                {d.observacoes && <p className="mt-2 line-clamp-2 text-meta text-text-subtle">{d.observacoes}</p>}
                <div className="mt-auto pt-3">
                  {d.anexo_id ? (
                    <button onClick={() => abrir(d)} className="flex w-full items-center gap-2 rounded-xl bg-[#F6F8FC] px-3 py-2 text-left text-meta transition hover:bg-[#EEF3FF]">
                      {imagem ? <ImageIcon size={15} className="shrink-0 text-[#1D4ED8]" /> : <FileText size={15} className="shrink-0 text-[#BA1A1A]" />}
                      <span className="min-w-0 flex-1 truncate text-text-body">{d.arquivo_nome ?? "arquivo"}</span>
                      <span className="shrink-0 text-text-subtle">{tamanho(d.arquivo_tamanho)}</span>
                    </button>
                  ) : (
                    <p className="rounded-xl bg-[#FFF8EB] px-3 py-2 text-meta text-[#92400E]">Sem arquivo anexado</p>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="truncate text-[11px] text-text-subtle">
                      {d.created_at ? `Enviado em ${dataBr(d.created_at)}` : ""}{d.enviado_por ? ` por ${d.enviado_por}` : ""}
                    </p>
                    <div className="flex shrink-0 gap-0.5">
                      {d.anexo_id && <>
                        <button title="Visualizar" onClick={() => abrir(d)} className="rounded-lg p-1.5 text-text-subtle hover:bg-[#F3F4F6] hover:text-text-title"><Eye size={15} /></button>
                        <button title="Baixar" onClick={() => baixar(d)} className="rounded-lg p-1.5 text-text-subtle hover:bg-[#F3F4F6] hover:text-text-title"><Download size={15} /></button>
                      </>}
                      {podeEditar && <>
                        <button title="Editar" onClick={() => setForm(d)} className="rounded-lg p-1.5 text-text-subtle hover:bg-[#F3F4F6] hover:text-text-title"><Pencil size={15} /></button>
                        <button title="Excluir" onClick={() => excluir(d)} className="rounded-lg p-1.5 text-text-subtle hover:bg-[#FEF3F2] hover:text-[#B42318]"><Trash2 size={15} /></button>
                      </>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {form && (
        <FormDocumento veiculoId={veiculoId} doc={form === "novo" ? null : form}
          onFechar={() => setForm(null)} onSalvo={() => { setForm(null); onMudou(); }} />
      )}
    </div>
  );
}

function FormDocumento({ veiculoId, doc, onFechar, onSalvo }: {
  veiculoId: string; doc: DocumentoVeiculo | null; onFechar: () => void; onSalvo: () => void;
}) {
  const [tipo, setTipo] = useState<Tipo>(tipoDe(doc?.tipo ?? "CRLV"));
  const [descricao, setDescricao] = useState(doc?.descricao ?? "");
  const [vencimento, setVencimento] = useState(doc?.vencimento ?? "");
  const [observacoes, setObservacoes] = useState(doc?.observacoes ?? "");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const descricaoTocada = useRef(!!doc);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onFechar]);

  // Sugere a descrição pelo tipo enquanto o usuário não escreve a dele.
  useEffect(() => {
    if (!descricaoTocada.current) setDescricao(`${TIPOS[tipo].rotulo} ${new Date().getFullYear()}`);
  }, [tipo]);

  const escolher = (f: File | undefined) => {
    if (!f) return;
    if (!/\.(pdf|jpe?g|png|webp)$/i.test(f.name)) { toast.error("Envie PDF ou imagem (JPG, PNG, WEBP)."); return; }
    if (f.size > 20 * 1024 * 1024) { toast.error("Arquivo maior que 20 MB."); return; }
    setArquivo(f);
  };

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doc && !arquivo) { toast.error("Anexe o arquivo do documento."); return; }
    setSalvando(true);
    try {
      const anexo_id = arquivo ? (await api.upload(arquivo)).id : undefined;
      const dados = {
        tipo, descricao: descricao.trim(), vencimento: TIPOS[tipo].vence && vencimento ? vencimento : null,
        observacoes: observacoes.trim() || null, ...(anexo_id ? { anexo_id } : {}),
      };
      if (doc) await api.editarDocumento(veiculoId, doc.id, dados);
      else await api.criarDocumento(veiculoId, dados);
      toast.success(doc ? "Documento atualizado." : "Documento salvo no veículo.");
      onSalvo();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSalvando(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F172A]/60 sm:items-center sm:p-4" onClick={onFechar}>
      <form role="dialog" aria-modal="true" aria-label={doc ? "Editar documento" : "Adicionar documento"} onSubmit={salvar} onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between border-b border-outline-variant/40 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-text-title">{doc ? "Editar documento" : "Adicionar documento"}</h2>
            <p className="text-body-sm text-text-subtle">PDF ou foto do documento, até 20 MB.</p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded-lg p-1.5 text-text-subtle hover:bg-[#F3F4F6]"><X size={18} /></button>
        </div>

        <div className="space-y-5 overflow-y-auto px-6 py-5">
          <fieldset>
            <legend className="mb-2 text-body-sm font-medium text-text-title">Tipo de documento</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(TIPOS) as Tipo[]).map((t) => {
                const m = TIPOS[t];
                const sel = tipo === t;
                return (
                  <label key={t} className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-3 text-center transition ${sel ? "border-[#1D5BD6] bg-[#F1F6FF]" : "border-outline-variant/50 hover:border-[#BFD3FF]"}`}>
                    <input type="radio" name="tipo-doc" className="sr-only" checked={sel} onChange={() => setTipo(t)} />
                    <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${m.cor}`}><m.icone size={17} /></span>
                    <span className="text-xs font-medium leading-tight text-text-title">{m.rotulo}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div
            onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastando(false); escolher(e.dataTransfer.files[0]); }}
            onClick={() => input.current?.click()}
            className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition ${arrastando ? "border-[#1D5BD6] bg-[#F1F6FF]" : arquivo ? "border-[#16A34A] bg-[#F0FDF4]" : "border-outline-variant hover:border-[#1D5BD6] hover:bg-[#F8FAFF]"}`}>
            <input ref={input} type="file" accept={ACEITOS} className="hidden" onChange={(e) => escolher(e.target.files?.[0])} />
            {arquivo ? (
              <>
                <FileCheck2 size={26} className="text-[#16A34A]" />
                <p className="font-medium text-text-title">{arquivo.name}</p>
                <p className="text-meta text-text-subtle">{tamanho(arquivo.size)} · clique para trocar</p>
              </>
            ) : (
              <>
                <UploadCloud size={28} className="text-[#1D5BD6]" />
                <p className="font-medium text-text-title">{doc?.anexo_id ? "Trocar o arquivo (opcional)" : "Arraste o arquivo aqui ou clique para escolher"}</p>
                <p className="text-meta text-text-subtle">{doc?.arquivo_nome ? `Atual: ${doc.arquivo_nome}` : "PDF, JPG, PNG ou WEBP"}</p>
              </>
            )}
          </div>

          <div className={`grid gap-4 ${TIPOS[tipo].vence ? "sm:grid-cols-[2fr_1fr]" : ""}`}>
            <label className="block text-body-sm font-medium text-text-title">Descrição
              <input className="input mt-1.5" required maxLength={255} value={descricao}
                onChange={(e) => { descricaoTocada.current = true; setDescricao(e.target.value); }}
                placeholder="Ex.: CRLV 2026, Apólice Porto Seguro, NF troca de pneus" />
            </label>
            {TIPOS[tipo].vence && (
              <label className="block text-body-sm font-medium text-text-title">Vencimento
                <input type="date" className="input mt-1.5" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
              </label>
            )}
          </div>
          {TIPOS[tipo].vence && <p className="-mt-3 text-meta text-text-subtle">Com vencimento, o sistema avisa em Alertas antes de vencer.</p>}

          <label className="block text-body-sm font-medium text-text-title">Observações <span className="font-normal text-text-subtle">(opcional)</span>
            <textarea className="input mt-1.5 min-h-[80px]" maxLength={2000} value={observacoes} onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Nº da apólice, oficina, valor, nº do processo…" />
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-outline-variant/40 px-6 py-4">
          <button type="button" className="btn btn-ghost" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={salvando}>
            {salvando ? <><Loader2 size={16} className="animate-spin" /> Salvando…</> : <><UploadCloud size={16} /> {doc ? "Salvar alterações" : "Salvar documento"}</>}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
