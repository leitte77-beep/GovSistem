"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { notify } from "@/components/ui/Toast";
import { formatCurrency, formatDate, STATUS_CONTRATO_LABELS, TIPO_ADITIVO_LABELS, RECURSOS_STATUS_COLORS } from "@/lib/utils";
import type { Contrato } from "@/types/govtask";
import { Plus, X, FileSignature } from "lucide-react";

type Props = { convenioId: string; canEdit: boolean };

export function ContratosTab({ convenioId, canEdit }: Props) {
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCriar, setShowCriar] = useState(false);
  const [form, setForm] = useState({
    numero: "", fornecedor: "", cnpj: "", objeto: "", valor: "", data_assinatura: "", vigencia_inicio: "", vigencia_fim: "",
  });
  const [aditivoContrato, setAditivoContrato] = useState<string | null>(null);
  const [aditivo, setAditivo] = useState({ numero: "", tipo: "PRAZO", motivo: "", valor: "", prazo: "", data: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setContratos(await api.listContratos(convenioId));
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [convenioId]);

  useEffect(() => { load(); }, [load]);

  const criar = async () => {
    try {
      await api.criarContrato(convenioId, {
        numero: form.numero || undefined,
        fornecedor: form.fornecedor || undefined,
        cnpj: form.cnpj || undefined,
        objeto: form.objeto || undefined,
        valor: form.valor ? Number(form.valor) : undefined,
        data_assinatura: form.data_assinatura || undefined,
        vigencia_inicio: form.vigencia_inicio || undefined,
        vigencia_fim: form.vigencia_fim || undefined,
      });
      notify.success("Contrato cadastrado!");
      setShowCriar(false);
      setForm({ numero: "", fornecedor: "", cnpj: "", objeto: "", valor: "", data_assinatura: "", vigencia_inicio: "", vigencia_fim: "" });
      load();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const criarAditivo = async (contratoId: string) => {
    try {
      await api.criarAditivo(convenioId, contratoId, {
        numero: aditivo.numero || undefined,
        tipo: aditivo.tipo,
        motivo: aditivo.motivo || undefined,
        valor: aditivo.valor ? Number(aditivo.valor) : undefined,
        prazo: aditivo.prazo || undefined,
        data: aditivo.data || undefined,
      });
      notify.success("Aditivo registrado!");
      setAditivoContrato(null);
      setAditivo({ numero: "", tipo: "PRAZO", motivo: "", valor: "", prazo: "", data: "" });
      load();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const inputCls = "w-full border border-surface-border rounded-btn px-3 py-2 text-sm bg-white text-text-title placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-body-sm text-text-body">Contratos celebrados e aditivos.</p>
        {canEdit && <Button size="sm" icon={Plus} onClick={() => setShowCriar(true)}>Cadastrar Contrato</Button>}
      </div>

      {loading ? (
        <div className="skeleton h-24 rounded-card" />
      ) : contratos.length === 0 ? (
        <EmptyState icon="file-text" title="Nenhum contrato" description="Cadastre o contrato da licitação ou da execução." />
      ) : (
        <div className="space-y-3">
          {contratos.map((c) => (
            <Card key={c.id} padding="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <FileSignature className="w-5 h-5 text-[#1D4ED8]" />
                    <span className="text-body font-semibold text-text-title">{c.numero || "Contrato"}</span>
                    <Badge label={STATUS_CONTRATO_LABELS[c.status] || c.status} color={RECURSOS_STATUS_COLORS[c.status] || "bg-[#F6F7F9] text-[#667085]"} />
                  </div>
                  <p className="text-body-sm text-text-body mt-1">{c.fornecedor}{c.cnpj ? ` — CNPJ ${c.cnpj}` : ""}</p>
                  {c.objeto && <p className="text-body-sm text-text-body mt-1">{c.objeto}</p>}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 text-body-sm">
                    <div><span className="text-meta text-text-subtle">Valor: </span><span className="tabular-nums text-text-title font-medium">{formatCurrency(c.valor)}</span></div>
                    {c.vigencia_inicio && <div><span className="text-meta text-text-subtle">Vigência: </span>{formatDate(c.vigencia_inicio)} a {formatDate(c.vigencia_fim)}</div>}
                    {c.data_assinatura && <div><span className="text-meta text-text-subtle">Assinatura: </span>{formatDate(c.data_assinatura)}</div>}
                  </div>
                  {c.aditivos.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-label text-text-subtle">Aditivos ({c.aditivos.length})</p>
                      {c.aditivos.map((a) => (
                        <div key={a.id} className="flex items-center gap-2 text-body-sm bg-[#F6F7F9] rounded-btn px-2 py-1">
                          <Badge label={TIPO_ADITIVO_LABELS[a.tipo] || a.tipo} color="bg-[#B54708]/10 text-[#B54708]" />
                          <span className="text-text-body">{a.numero || "Sem número"}</span>
                          {a.motivo && <span className="text-text-body truncate">{a.motivo}</span>}
                          {a.valor != null && <span className="tabular-nums text-text-title">{formatCurrency(a.valor)}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {canEdit && <Button variant="secondary" size="sm" icon={Plus} onClick={() => setAditivoContrato(c.id)}>Aditivo</Button>}
              </div>

              {aditivoContrato === c.id && (
                <div className="mt-3 pt-3 border-t border-surface-border space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input value={aditivo.numero} onChange={(e) => setAditivo({ ...aditivo, numero: e.target.value })} className={inputCls} placeholder="Número do aditivo" />
                    <select value={aditivo.tipo} onChange={(e) => setAditivo({ ...aditivo, tipo: e.target.value })} className={inputCls}>
                      {Object.entries(TIPO_ADITIVO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <input value={aditivo.motivo} onChange={(e) => setAditivo({ ...aditivo, motivo: e.target.value })} className={inputCls} placeholder="Motivo" />
                  <div className="flex gap-2">
                    <input type="number" step="0.01" value={aditivo.valor} onChange={(e) => setAditivo({ ...aditivo, valor: e.target.value })} className={inputCls} placeholder="Valor" />
                    <input type="date" value={aditivo.prazo} onChange={(e) => setAditivo({ ...aditivo, prazo: e.target.value })} className={inputCls} />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="secondary" size="sm" onClick={() => setAditivoContrato(null)}>Cancelar</Button>
                    <Button size="sm" icon={Plus} onClick={() => criarAditivo(c.id)}>Registrar Aditivo</Button>
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
              <h3 className="text-h3 text-text-title">Cadastrar Contrato</h3>
              <button onClick={() => setShowCriar(false)} className="text-text-subtle hover:text-text-title"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-label text-text-body mb-1 block">Número</label><input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} className={inputCls} /></div>
                <div><label className="text-label text-text-body mb-1 block">CNPJ</label><input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} className={inputCls} /></div>
              </div>
              <div><label className="text-label text-text-body mb-1 block">Fornecedor</label><input value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} className={inputCls} /></div>
              <div><label className="text-label text-text-body mb-1 block">Objeto</label><input value={form.objeto} onChange={(e) => setForm({ ...form, objeto: e.target.value })} className={inputCls} /></div>
              <div><label className="text-label text-text-body mb-1 block">Valor (R$)</label><input type="number" step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} className={inputCls} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><label className="text-label text-text-body mb-1 block">Assinatura</label><input type="date" value={form.data_assinatura} onChange={(e) => setForm({ ...form, data_assinatura: e.target.value })} className={inputCls} /></div>
                <div><label className="text-label text-text-body mb-1 block">Vigência início</label><input type="date" value={form.vigencia_inicio} onChange={(e) => setForm({ ...form, vigencia_inicio: e.target.value })} className={inputCls} /></div>
                <div><label className="text-label text-text-body mb-1 block">Vigência fim</label><input type="date" value={form.vigencia_fim} onChange={(e) => setForm({ ...form, vigencia_fim: e.target.value })} className={inputCls} /></div>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-5">
              <Button variant="secondary" onClick={() => setShowCriar(false)}>Cancelar</Button>
              <Button icon={Plus} onClick={criar}>Cadastrar</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
