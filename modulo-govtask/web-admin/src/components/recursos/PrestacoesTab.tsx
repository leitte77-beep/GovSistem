"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { notify } from "@/components/ui/Toast";
import {
  cn,
  formatDate,
  pct,
  CATEGORIA_DOCUMENTO_LABELS,
  STATUS_PRESTACAO_LABELS,
  RECURSOS_STATUS_COLORS,
} from "@/lib/utils";
import type { Anexo, Prestacao } from "@/types/govtask";
import { Plus, CheckCircle2, Link2, Trash2, Send } from "lucide-react";

type Props = { convenioId: string; canEdit: boolean };

const CHECKLIST_PADRAO = [
  "Relatório de execução",
  "Relatório fotográfico",
  "Notas fiscais",
  "Pagamentos",
  "Extratos bancários",
  "Medições",
  "Documentos licitatórios",
  "Contrato",
  "Termo de recebimento",
  "Registros patrimoniais",
];

export function PrestacoesTab({ convenioId, canEdit }: Props) {
  const [prestacoes, setPrestacoes] = useState<Prestacao[]>([]);
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [loading, setLoading] = useState(true);
  const [criando, setCriando] = useState(false);
  const [novoItem, setNovoItem] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState<string | null>(null);
  const [formEnvio, setFormEnvio] = useState({ sistema_envio: "", protocolo: "", observacao: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, c] = await Promise.all([
        api.listPrestacoes(convenioId),
        api.getConvenio(convenioId).catch(() => null),
      ]);
      setPrestacoes(p);
      setAnexos(((c as any)?.anexos || []) as Anexo[]);
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [convenioId]);

  useEffect(() => {
    load();
  }, [load]);

  const criar = async () => {
    setCriando(true);
    try {
      const p = await api.criarPrestacao(convenioId, {});
      for (const item of CHECKLIST_PADRAO) {
        await api.adicionarItemPrestacao(convenioId, p.id, item);
      }
      notify.success("Prestação criada com o checklist padrão!");
      load();
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setCriando(false);
    }
  };

  const alternarItem = async (prestacaoId: string, itemId: string, conferido: boolean) => {
    try {
      await api.alternarItemPrestacao(convenioId, prestacaoId, itemId, !conferido);
      load();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const vincular = async (prestacaoId: string, itemId: string, anexoId: string) => {
    try {
      await api.vincularDocumentoItemPrestacao(convenioId, prestacaoId, itemId, anexoId || null);
      notify.success(anexoId ? "Documento vinculado!" : "Documento desvinculado!");
      load();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const excluirItem = async (prestacaoId: string, itemId: string) => {
    if (!window.confirm("Remover este item do checklist?")) return;
    try {
      await api.excluirItemPrestacao(convenioId, prestacaoId, itemId);
      load();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const adicionarItem = async (prestacaoId: string) => {
    const descricao = (novoItem[prestacaoId] || "").trim();
    if (descricao.length < 3) return notify.error("Descreva o item do checklist");
    try {
      await api.adicionarItemPrestacao(convenioId, prestacaoId, descricao);
      setNovoItem((prev) => ({ ...prev, [prestacaoId]: "" }));
      load();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const enviar = async (id: string) => {
    try {
      await api.enviarPrestacao(convenioId, id, {
        sistema_envio: formEnvio.sistema_envio || undefined,
        protocolo: formEnvio.protocolo || undefined,
        observacao: formEnvio.observacao || undefined,
      });
      notify.success("Prestação enviada!");
      setEnviando(null);
      setFormEnvio({ sistema_envio: "", protocolo: "", observacao: "" });
      load();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const inputCls =
    "w-full rounded-lg border border-[#E4E7EC] bg-white px-3.5 py-2.5 text-[14px] text-[#101828] placeholder:text-[#98A2B3] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]";

  if (loading) {
    return <div className="skeleton h-72 rounded-xl" />;
  }

  if (prestacoes.length === 0) {
    return (
      <div className="bg-white border border-[#E4E7EC] rounded-xl p-10 text-center">
        <p className="text-[14px] text-[#475467]">
          Este processo ainda não possui prestação de contas iniciada.
        </p>
        {canEdit && (
          <button
            type="button"
            onClick={criar}
            disabled={criando}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1D4ED8] text-white px-4 py-2.5 text-[13px] font-semibold hover:bg-[#1E40AF] disabled:bg-[#A4BCFD] transition-colors mt-4"
          >
            <Plus className="w-4 h-4" /> Iniciar prestação de contas
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-8 space-y-6">
        {prestacoes.map((p) => {
          const conferidos = p.itens.filter((i) => i.conferido).length;
          return (
            <div key={p.id} className="bg-white border border-[#E4E7EC] rounded-xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="text-[15px] font-semibold text-[#101828]">
                    {p.titulo || "Checklist da prestação"}
                  </h3>
                  <p className="text-[13px] text-[#98A2B3] mt-0.5">
                    {conferidos} de {p.itens.length} documentos recebidos
                  </p>
                </div>
                <span
                  className={cn(
                    "inline-flex items-center rounded-pill px-2.5 py-1 text-[12px] font-medium shrink-0",
                    RECURSOS_STATUS_COLORS[p.status] || "bg-[#F2F4F7] text-[#475467]"
                  )}
                >
                  {STATUS_PRESTACAO_LABELS[p.status] || p.status}
                </span>
              </div>

              {/* Preparação */}
              <div className="mt-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] text-[#667085]">Prestação de contas preparada</span>
                  <span className="text-[12px] text-[#475467] tabular-nums">
                    {Math.round(pct(p.percentual_preparacao))}%
                  </span>
                </div>
                <div className="h-1.5 bg-[#F2F4F7] rounded-pill overflow-hidden">
                  <div
                    className="h-full bg-[#9E77ED] rounded-pill transition-all duration-700"
                    style={{ width: `${pct(p.percentual_preparacao)}%` }}
                  />
                </div>
              </div>

              {/* Itens */}
              <div className="mt-5 space-y-4">
                {p.itens.map((item) => (
                  <div key={item.id} className="flex items-start gap-3">
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => alternarItem(p.id, item.id, item.conferido)}
                      className="mt-0.5 shrink-0 disabled:cursor-not-allowed"
                      aria-label={item.conferido ? "Marcar como pendente" : "Marcar como recebido"}
                    >
                      {item.conferido ? (
                        <CheckCircle2 className="w-5 h-5 text-[#12B76A]" />
                      ) : (
                        <span className="block w-5 h-5 rounded-md border border-[#D0D5DD] bg-white" />
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-[14px]",
                          item.conferido ? "text-[#98A2B3] line-through" : "text-[#101828]"
                        )}
                      >
                        {item.descricao}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Link2 className="w-3.5 h-3.5 text-[#98A2B3] shrink-0" />
                        <select
                          value={item.anexo_id || ""}
                          disabled={!canEdit}
                          onChange={(e) => vincular(p.id, item.id, e.target.value)}
                          className="flex-1 max-w-md rounded-lg border border-[#E4E7EC] bg-white px-3 py-1.5 text-[13px] text-[#475467] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 disabled:bg-[#F9FAFB]"
                        >
                          <option value="">Vincular documento...</option>
                          {anexos.map((a) => (
                            <option key={a.id} value={a.id}>
                              {(a.descricao || a.nome_arquivo).slice(0, 60)} —{" "}
                              {CATEGORIA_DOCUMENTO_LABELS[a.categoria] || a.categoria}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => excluirItem(p.id, item.id)}
                        className="p-1.5 rounded-lg text-[#D0D5DD] hover:text-[#B42318] hover:bg-[#B42318]/5 transition-colors shrink-0"
                        title="Remover item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {canEdit && (
                <div className="flex items-center gap-2 mt-5 pt-4 border-t border-[#F2F4F7]">
                  <input
                    value={novoItem[p.id] || ""}
                    onChange={(e) => setNovoItem((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") adicionarItem(p.id);
                    }}
                    placeholder="Adicionar item ao checklist..."
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={() => adicionarItem(p.id)}
                    className="rounded-lg border border-[#E4E7EC] bg-white text-[#344054] px-4 py-2.5 text-[13px] font-medium hover:bg-[#F9FAFB] transition-colors shrink-0"
                  >
                    Adicionar
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Envio da prestação */}
      <div className="lg:col-span-4 space-y-6">
        {prestacoes.map((p) => (
          <div key={p.id} className="bg-white border border-[#E4E7EC] rounded-xl p-5">
            <h3 className="text-[15px] font-semibold text-[#101828] mb-4">Envio ao órgão</h3>
            <dl className="space-y-2.5">
              <Linha label="Situação" valor={STATUS_PRESTACAO_LABELS[p.status] || p.status} />
              <Linha label="Sistema" valor={p.sistema_envio || "—"} />
              <Linha label="Protocolo" valor={p.protocolo || "—"} />
              <Linha label="Data de envio" valor={p.data_envio ? formatDate(p.data_envio) : "—"} />
            </dl>
            {p.parecer && (
              <div className="mt-4 bg-[#F9FAFB] border border-[#F2F4F7] rounded-lg p-3">
                <p className="text-[12px] text-[#98A2B3] mb-0.5">Parecer</p>
                <p className="text-[13px] text-[#475467]">{p.parecer}</p>
              </div>
            )}

            {canEdit && !p.data_envio && (
              <>
                {enviando === p.id ? (
                  <div className="mt-4 space-y-3">
                    <input
                      value={formEnvio.sistema_envio}
                      onChange={(e) => setFormEnvio({ ...formEnvio, sistema_envio: e.target.value })}
                      placeholder="Sistema (ex: Transferegov)"
                      className={inputCls}
                    />
                    <input
                      value={formEnvio.protocolo}
                      onChange={(e) => setFormEnvio({ ...formEnvio, protocolo: e.target.value })}
                      placeholder="Protocolo"
                      className={inputCls}
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEnviando(null)}
                        className="px-3 py-2 text-[13px] font-medium text-[#475467] hover:text-[#101828] transition-colors"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => enviar(p.id)}
                        className="inline-flex items-center gap-2 rounded-lg bg-[#1D4ED8] text-white px-3.5 py-2 text-[13px] font-semibold hover:bg-[#1E40AF] transition-colors"
                      >
                        <Send className="w-4 h-4" /> Enviar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEnviando(p.id)}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#1D4ED8] text-white px-4 py-2.5 text-[13px] font-semibold hover:bg-[#1E40AF] transition-colors mt-4"
                  >
                    <Send className="w-4 h-4" /> Registrar envio
                  </button>
                )}
              </>
            )}
          </div>
        ))}

        {canEdit && (
          <button
            type="button"
            onClick={criar}
            disabled={criando}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-[#E4E7EC] bg-white text-[#344054] px-4 py-2.5 text-[13px] font-medium hover:bg-[#F9FAFB] disabled:opacity-60 transition-colors"
          >
            <Plus className="w-4 h-4" /> Nova prestação
          </button>
        )}
      </div>
    </div>
  );
}

function Linha({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-[13px] text-[#98A2B3] shrink-0">{label}</dt>
      <dd className="text-[13px] text-[#101828] text-right font-medium min-w-0 truncate">{valor}</dd>
    </div>
  );
}
