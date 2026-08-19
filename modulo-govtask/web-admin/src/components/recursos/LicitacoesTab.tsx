"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { notify } from "@/components/ui/Toast";
import { formatCurrency, formatDate, STATUS_LICITACAO_LABELS, RECURSOS_STATUS_COLORS } from "@/lib/utils";
import type { Licitacao } from "@/types/govtask";
import { Plus, X, Gavel } from "lucide-react";

type Props = { convenioId: string; canEdit: boolean };

export function LicitacoesTab({ convenioId, canEdit }: Props) {
  const [licitacoes, setLicitacoes] = useState<Licitacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCriar, setShowCriar] = useState(false);
  const [form, setForm] = useState({
    numero: "", modalidade: "", objeto: "", valor_estimado: "", valor_contratado: "", vencedor: "", cnpj_vencedor: "", situacao: "PREPARATORIA",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLicitacoes(await api.listLicitacoes(convenioId));
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [convenioId]);

  useEffect(() => { load(); }, [load]);

  const criar = async () => {
    try {
      await api.criarLicitacao(convenioId, {
        numero: form.numero || undefined,
        modalidade: form.modalidade || undefined,
        objeto: form.objeto || undefined,
        valor_estimado: form.valor_estimado ? Number(form.valor_estimado) : undefined,
        valor_contratado: form.valor_contratado ? Number(form.valor_contratado) : undefined,
        vencedor: form.vencedor || undefined,
        cnpj_vencedor: form.cnpj_vencedor || undefined,
      });
      notify.success("Licitação vinculada!");
      setShowCriar(false);
      setForm({ numero: "", modalidade: "", objeto: "", valor_estimado: "", valor_contratado: "", vencedor: "", cnpj_vencedor: "", situacao: "PREPARATORIA" });
      load();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const mudarSituacao = async (l: Licitacao) => {
    const valor = window.prompt("Nova situação da licitação:", l.situacao);
    if (!valor) return;
    try {
      await api.atualizarLicitacao(convenioId, l.id, { situacao: valor });
      notify.success("Situação atualizada!");
      load();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const inputCls = "w-full border border-surface-border rounded-btn px-3 py-2 text-sm bg-white text-text-title placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-body-sm text-text-body">Processos licitatórios vinculados ao recurso.</p>
        {canEdit && <Button size="sm" icon={Plus} onClick={() => setShowCriar(true)}>Vincular Licitação</Button>}
      </div>

      {loading ? (
        <div className="skeleton h-24 rounded-card" />
      ) : licitacoes.length === 0 ? (
        <EmptyState icon="file-text" title="Nenhuma licitação" description="Vincule o processo licitatório deste recurso." />
      ) : (
        <div className="space-y-3">
          {licitacoes.map((l) => (
            <Card key={l.id} padding="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Gavel className="w-5 h-5 text-[#1D4ED8]" />
                    <span className="text-body font-semibold text-text-title">{l.numero || "Licitação"}</span>
                    {l.modalidade && <Badge label={l.modalidade} color="bg-[#F6F7F9] text-[#667085]" />}
                    <Badge label={STATUS_LICITACAO_LABELS[l.situacao] || l.situacao} color={RECURSOS_STATUS_COLORS[l.situacao] || "bg-[#F6F7F9] text-[#667085]"} />
                  </div>
                  {l.objeto && <p className="text-body-sm text-text-body mt-1">{l.objeto}</p>}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2 text-body-sm">
                    <div><span className="text-meta text-text-subtle">Estimado: </span><span className="tabular-nums text-text-title">{formatCurrency(l.valor_estimado)}</span></div>
                    <div><span className="text-meta text-text-subtle">Contratado: </span><span className="tabular-nums text-text-title">{formatCurrency(l.valor_contratado)}</span></div>
                  </div>
                  {l.vencedor && (
                    <p className="text-body-sm text-text-body mt-1">
                      Vencedor: <span className="font-medium text-text-title">{l.vencedor}</span>{l.cnpj_vencedor ? ` — CNPJ ${l.cnpj_vencedor}` : ""}
                    </p>
                  )}
                  {l.data_homologacao && <p className="text-meta text-text-subtle mt-1">Homologada em {formatDate(l.data_homologacao)}</p>}
                </div>
                {canEdit && <Button variant="secondary" size="sm" onClick={() => mudarSituacao(l)}>Mudar Situação</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {showCriar && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-card p-6 w-full max-w-lg shadow-elevated max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-h3 text-text-title">Vincular Licitação</h3>
              <button onClick={() => setShowCriar(false)} className="text-text-subtle hover:text-text-title"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-label text-text-body mb-1 block">Número</label><input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} className={inputCls} /></div>
                <div><label className="text-label text-text-body mb-1 block">Modalidade</label><input value={form.modalidade} onChange={(e) => setForm({ ...form, modalidade: e.target.value })} className={inputCls} /></div>
              </div>
              <div><label className="text-label text-text-body mb-1 block">Objeto</label><input value={form.objeto} onChange={(e) => setForm({ ...form, objeto: e.target.value })} className={inputCls} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-label text-text-body mb-1 block">Valor estimado (R$)</label><input type="number" step="0.01" value={form.valor_estimado} onChange={(e) => setForm({ ...form, valor_estimado: e.target.value })} className={inputCls} /></div>
                <div><label className="text-label text-text-body mb-1 block">Valor contratado (R$)</label><input type="number" step="0.01" value={form.valor_contratado} onChange={(e) => setForm({ ...form, valor_contratado: e.target.value })} className={inputCls} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-label text-text-body mb-1 block">Vencedor</label><input value={form.vencedor} onChange={(e) => setForm({ ...form, vencedor: e.target.value })} className={inputCls} /></div>
                <div><label className="text-label text-text-body mb-1 block">CNPJ vencedor</label><input value={form.cnpj_vencedor} onChange={(e) => setForm({ ...form, cnpj_vencedor: e.target.value })} className={inputCls} /></div>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-5">
              <Button variant="secondary" onClick={() => setShowCriar(false)}>Cancelar</Button>
              <Button icon={Plus} onClick={criar}>Vincular</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
