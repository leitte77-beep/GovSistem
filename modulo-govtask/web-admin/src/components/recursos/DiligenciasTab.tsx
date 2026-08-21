"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { notify } from "@/components/ui/Toast";
import {
  cn,
  formatDate,
  ORIGEM_DILIGENCIA_LABELS,
  STATUS_DILIGENCIA_LABELS,
  RECURSOS_STATUS_COLORS,
} from "@/lib/utils";
import type { Diligencia, Setor } from "@/types/govtask";
import { Plus, MessageSquare, Send } from "lucide-react";

type Props = {
  convenioId: string;
  canEdit: boolean;
};

export function DiligenciasTab({ convenioId, canEdit }: Props) {
  const [diligencias, setDiligencias] = useState<Diligencia[]>([]);
  const [setores, setSetores] = useState<Setor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [respondendo, setRespondendo] = useState<string | null>(null);
  const [resposta, setResposta] = useState("");
  const [protocoloResposta, setProtocoloResposta] = useState("");

  const [form, setForm] = useState({
    descricao: "",
    origem_descricao: "",
    setor_destino_id: "",
    prazo: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDiligencias(await api.listDiligencias(convenioId));
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [convenioId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.listSetores().then(setSetores).catch(() => {});
  }, []);

  const criar = async () => {
    if (!form.descricao.trim()) return notify.error("Informe a descrição da diligência");
    setSalvando(true);
    try {
      await api.criarDiligencia(convenioId, {
        // A origem do enum não é escolhida na tela: o texto informado descreve o órgão.
        origem: "CONCEDENTE",
        origem_descricao: form.origem_descricao || undefined,
        descricao: form.descricao,
        setor_destino_id: form.setor_destino_id || undefined,
        prazo: form.prazo || undefined,
      });
      notify.success("Diligência registrada!");
      setForm({ descricao: "", origem_descricao: "", setor_destino_id: "", prazo: "" });
      setShowForm(false);
      load();
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const mudarStatus = async (d: Diligencia, status: string) => {
    try {
      await api.atualizarDiligencia(d.id, { status });
      notify.success("Situação da diligência atualizada!");
      load();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const responder = async (id: string) => {
    if (!resposta.trim()) return notify.error("Informe a resposta interna");
    try {
      await api.responderDiligencia(id, {
        resposta_interna: resposta,
        resposta_protocolo: protocoloResposta || undefined,
      });
      notify.success("Resposta registrada!");
      setRespondendo(null);
      setResposta("");
      setProtocoloResposta("");
      load();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const inputCls =
    "w-full rounded-lg border border-[#E4E7EC] bg-white px-3.5 py-2.5 text-[14px] text-[#101828] placeholder:text-[#98A2B3] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]";
  const labelCls = "block text-[13px] text-[#475467] mb-1.5";

  const setorNome = (id: string | null) => setores.find((s) => s.id === id)?.nome;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-[14px] text-[#475467]">{diligencias.length} diligência(s)</p>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1D4ED8] text-white px-4 py-2.5 text-[13px] font-semibold hover:bg-[#1E40AF] transition-colors"
          >
            <Plus className="w-4 h-4" /> Registrar diligência
          </button>
        )}
      </div>

      {showForm && canEdit && (
        <div className="bg-white border border-[#E4E7EC] rounded-xl p-5">
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Descrição *</label>
              <textarea
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                rows={3}
                placeholder="Ex: Governo solicitou correção do orçamento da estrutura."
                className={`${inputCls} resize-y`}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Origem</label>
                <input
                  value={form.origem_descricao}
                  onChange={(e) => setForm({ ...form, origem_descricao: e.target.value })}
                  placeholder="Ex: Ministério da Educação"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Departamento responsável</label>
                <select
                  value={form.setor_destino_id}
                  onChange={(e) => setForm({ ...form, setor_destino_id: e.target.value })}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {setores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="sm:w-1/2">
              <label className={labelCls}>Prazo</label>
              <input
                type="date"
                value={form.prazo}
                onChange={(e) => setForm({ ...form, prazo: e.target.value })}
                className={inputCls}
              />
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
              onClick={criar}
              disabled={!form.descricao.trim() || salvando}
              className="rounded-lg bg-[#1D4ED8] text-white px-4 py-2.5 text-[13px] font-semibold hover:bg-[#1E40AF] disabled:bg-[#A4BCFD] disabled:cursor-not-allowed transition-colors"
            >
              Registrar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="skeleton h-24 rounded-xl" />
          ))}
        </div>
      ) : diligencias.length === 0 ? (
        <p className="text-[13px] text-[#98A2B3] text-center py-10">
          Nenhuma diligência registrada neste processo.
        </p>
      ) : (
        <div className="space-y-3">
          {diligencias.map((d) => (
            <div key={d.id} className="bg-white border border-[#E4E7EC] rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] text-[#101828]">{d.descricao}</p>
                  <div className="flex items-center gap-2.5 mt-2.5 flex-wrap text-[12px] text-[#667085]">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-pill px-2.5 py-1 font-medium",
                        RECURSOS_STATUS_COLORS[d.status] || "bg-[#F2F4F7] text-[#475467]"
                      )}
                    >
                      {STATUS_DILIGENCIA_LABELS[d.status] || d.status}
                    </span>
                    <span>
                      Origem: {d.origem_descricao || ORIGEM_DILIGENCIA_LABELS[d.origem] || d.origem}
                    </span>
                    {setorNome(d.setor_destino_id) && <span>{setorNome(d.setor_destino_id)}</span>}
                    {d.prazo && <span>Prazo: {formatDate(d.prazo)}</span>}
                    {d.protocolo && <span>Protocolo: {d.protocolo}</span>}
                  </div>
                  {d.resposta_interna && (
                    <div className="mt-3 bg-[#F9FAFB] border border-[#F2F4F7] rounded-lg p-3">
                      <p className="text-[12px] text-[#98A2B3] mb-0.5">Resposta interna</p>
                      <p className="text-[13px] text-[#475467]">{d.resposta_interna}</p>
                      {d.resposta_protocolo && (
                        <p className="text-[12px] text-[#067647] mt-1">Protocolada: {d.resposta_protocolo}</p>
                      )}
                    </div>
                  )}
                </div>

                {canEdit && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setRespondendo(respondendo === d.id ? null : d.id)}
                      className="p-2 rounded-lg text-[#98A2B3] hover:text-[#1D4ED8] hover:bg-[#1D4ED8]/5 transition-colors"
                      title="Responder diligência"
                    >
                      <MessageSquare className="w-[18px] h-[18px]" />
                    </button>
                    <select
                      value={d.status}
                      onChange={(e) => mudarStatus(d, e.target.value)}
                      className="rounded-lg border border-[#E4E7EC] bg-white px-3 py-2 text-[13px] text-[#344054] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
                    >
                      {Object.entries(STATUS_DILIGENCIA_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {respondendo === d.id && canEdit && (
                <div className="mt-4 pt-4 border-t border-[#F2F4F7] space-y-3">
                  <textarea
                    value={resposta}
                    onChange={(e) => setResposta(e.target.value)}
                    placeholder="Resposta elaborada internamente..."
                    rows={3}
                    className={`${inputCls} resize-y`}
                  />
                  <input
                    value={protocoloResposta}
                    onChange={(e) => setProtocoloResposta(e.target.value)}
                    placeholder="Protocolo da resposta (opcional)"
                    className={inputCls}
                  />
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setRespondendo(null);
                        setResposta("");
                        setProtocoloResposta("");
                      }}
                      className="px-4 py-2.5 text-[13px] font-medium text-[#475467] hover:text-[#101828] transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => responder(d.id)}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#1D4ED8] text-white px-4 py-2.5 text-[13px] font-semibold hover:bg-[#1E40AF] transition-colors"
                    >
                      <Send className="w-4 h-4" /> Registrar resposta
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
