"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { notify } from "@/components/ui/Toast";
import { formatDate, ORIGEM_DILIGENCIA_LABELS, STATUS_DILIGENCIA_LABELS, RECURSOS_STATUS_COLORS, cn } from "@/lib/utils";
import type { Diligencia } from "@/types/govtask";
import { AlertCircle, Plus, Send, CheckCircle, X, MessageSquare } from "lucide-react";

type Props = {
  convenioId: string;
  canEdit: boolean;
};

export function DiligenciasTab({ convenioId, canEdit }: Props) {
  const { user } = useAuth();
  const [diligencias, setDiligencias] = useState<Diligencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCriar, setShowCriar] = useState(false);
  const [respondendo, setRespondendo] = useState<string | null>(null);

  const [form, setForm] = useState({
    origem: "GOVERNO_FEDERAL",
    origem_descricao: "",
    descricao: "",
    prazo: "",
    protocolo: "",
  });
  const [resposta, setResposta] = useState("");
  const [protocoloResposta, setProtocoloResposta] = useState("");

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

  useEffect(() => { load(); }, [load]);

  const criar = async () => {
    if (!form.descricao.trim()) return notify.error("Informe a descrição da diligência");
    try {
      await api.criarDiligencia(convenioId, {
        origem: form.origem,
        origem_descricao: form.origem_descricao || undefined,
        descricao: form.descricao,
        prazo: form.prazo || undefined,
        protocolo: form.protocolo || undefined,
      });
      notify.success("Diligência registrada!");
      setShowCriar(false);
      setForm({ origem: "GOVERNO_FEDERAL", origem_descricao: "", descricao: "", prazo: "", protocolo: "" });
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

  const protocolar = async (id: string) => {
    const proto = window.prompt("Número do protocolo da resposta enviada:");
    if (!proto) return;
    try {
      await api.protocolarDiligencia(id, { resposta_protocolo: proto });
      notify.success("Resposta protocolada!");
      load();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const encerrar = async (d: Diligencia) => {
    if (!window.confirm("Encerrar esta diligência?")) return;
    try {
      await api.atualizarDiligencia(d.id, { status: "ENCERRADA" });
      notify.success("Diligência encerrada!");
      load();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const inputCls = "w-full border border-surface-border rounded-btn px-3 py-2 text-sm bg-white text-text-title placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]";

  const podeResponder = canEdit || user?.roles?.some((r) => r.name === "ENGENHEIRO_TECNICO");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-body-sm text-text-body">
          Diligências e pendências externas recebidas do órgão concedente.
        </p>
        {canEdit && (
          <Button size="sm" icon={Plus} onClick={() => setShowCriar(true)}>
            Nova Diligência
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => <div key={i} className="skeleton h-24 rounded-card" />)}
        </div>
      ) : diligencias.length === 0 ? (
        <EmptyState
          icon="alert-triangle"
          title="Nenhuma diligência"
          description="Quando o órgão concedente solicitar correções ou documentos, registre aqui para acompanhamento."
        />
      ) : (
        <div className="space-y-3">
          {diligencias.map((d) => (
            <Card key={d.id} padding="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge label={ORIGEM_DILIGENCIA_LABELS[d.origem] || d.origem} color="bg-[#1D4ED8]/10 text-[#1D4ED8]" />
                    <Badge label={STATUS_DILIGENCIA_LABELS[d.status] || d.status} color={RECURSOS_STATUS_COLORS[d.status] || "bg-[#F6F7F9] text-[#667085]"} />
                    {d.prazo && <span className="text-meta text-text-subtle">Prazo: {formatDate(d.prazo)}</span>}
                    {d.protocolo && <span className="text-meta text-text-subtle">Protocolo: {d.protocolo}</span>}
                  </div>
                  <p className="text-body-sm font-medium text-text-title mt-2">{d.descricao}</p>
                  {d.origem_descricao && (
                    <p className="text-meta text-text-subtle mt-0.5">Origem: {d.origem_descricao}</p>
                  )}
                  {d.resposta_interna && (
                    <div className="mt-2 bg-[#F6F7F9] rounded-btn p-2 text-body-sm text-text-body">
                      <p className="text-meta text-text-subtle mb-0.5">Resposta interna:</p>
                      {d.resposta_interna}
                      {d.resposta_protocolo && <p className="text-meta text-[#067647] mt-1">Protocolada: {d.resposta_protocolo}</p>}
                    </div>
                  )}
                  <p className="text-meta text-text-subtle mt-1">Recebida em {formatDate(d.data_recebimento || d.created_at)}</p>
                </div>
                {canEdit && d.status !== "ENCERRADA" && (
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button variant="secondary" size="sm" icon={MessageSquare} onClick={() => setRespondendo(d.id)}>
                      Responder
                    </Button>
                    {d.status === "RESPONDIDA_INTERNAMENTE" && (
                      <Button variant="secondary" size="sm" icon={Send} onClick={() => protocolar(d.id)}>
                        Protocolar
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" icon={CheckCircle} onClick={() => encerrar(d)}>
                      Encerrar
                    </Button>
                  </div>
                )}
              </div>

              {respondendo === d.id && (
                <div className="mt-3 pt-3 border-t border-surface-border space-y-2">
                  <textarea
                    value={resposta}
                    onChange={(e) => setResposta(e.target.value)}
                    placeholder="Resposta elaborada internamente..."
                    rows={3}
                    className={inputCls}
                  />
                  <input
                    value={protocoloResposta}
                    onChange={(e) => setProtocoloResposta(e.target.value)}
                    placeholder="Protocolo (opcional)"
                    className={inputCls}
                  />
                  <div className="flex gap-2 justify-end">
                    <Button variant="secondary" size="sm" onClick={() => { setRespondendo(null); setResposta(""); setProtocoloResposta(""); }}>
                      Cancelar
                    </Button>
                    <Button size="sm" icon={Send} onClick={() => responder(d.id)}>
                      Registrar Resposta
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {showCriar && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-card p-6 w-full max-w-lg shadow-elevated max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-h3 text-text-title">Registrar Diligência</h3>
              <button onClick={() => setShowCriar(false)} className="text-text-subtle hover:text-text-title">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-label text-text-body mb-1 block">Origem</label>
                <select value={form.origem} onChange={(e) => setForm({ ...form, origem: e.target.value })} className={inputCls}>
                  {Object.entries(ORIGEM_DILIGENCIA_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="text-label text-text-body mb-1 block">Órgão/descrição da origem</label>
                <input value={form.origem_descricao} onChange={(e) => setForm({ ...form, origem_descricao: e.target.value })} className={inputCls} placeholder="Ex: Ministério da Educação" />
              </div>
              <div>
                <label className="text-label text-text-body mb-1 block">Descrição *</label>
                <textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} rows={3} className={inputCls} placeholder="O que foi solicitado pelo órgão?" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-label text-text-body mb-1 block">Prazo</label>
                  <input type="date" value={form.prazo} onChange={(e) => setForm({ ...form, prazo: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="text-label text-text-body mb-1 block">Protocolo</label>
                  <input value={form.protocolo} onChange={(e) => setForm({ ...form, protocolo: e.target.value })} className={inputCls} />
                </div>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-5">
              <Button variant="secondary" onClick={() => setShowCriar(false)}>Cancelar</Button>
              <Button icon={Plus} onClick={criar}>Registrar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
