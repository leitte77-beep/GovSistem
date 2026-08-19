"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { notify } from "@/components/ui/Toast";
import { formatDate, STATUS_ENTREGA_LABELS, RECURSOS_STATUS_COLORS } from "@/lib/utils";
import type { EntregaObjeto } from "@/types/govtask";
import { Plus, X, PackageCheck } from "lucide-react";

type Props = { convenioId: string; canEdit: boolean };

export function EntregasTab({ convenioId, canEdit }: Props) {
  const [entregas, setEntregas] = useState<EntregaObjeto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCriar, setShowCriar] = useState(false);
  const [form, setForm] = useState({
    tipo: "AQUISICAO", fornecedor: "", data_entrega: "", nota_fiscal: "", quantidade: "", identificacao: "", patrimonio: "", placa: "", chassi: "", modelo: "", local_entrega: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEntregas(await api.listEntregas(convenioId));
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [convenioId]);

  useEffect(() => { load(); }, [load]);

  const criar = async () => {
    try {
      await api.criarEntrega(convenioId, {
        tipo: form.tipo,
        fornecedor: form.fornecedor || undefined,
        data_entrega: form.data_entrega || undefined,
        nota_fiscal: form.nota_fiscal || undefined,
        quantidade: form.quantidade ? Number(form.quantidade) : undefined,
        identificacao: form.identificacao || undefined,
        patrimonio: form.patrimonio || undefined,
        placa: form.placa || undefined,
        chassi: form.chassi || undefined,
        modelo: form.modelo || undefined,
        local_entrega: form.local_entrega || undefined,
      });
      notify.success("Entrega registrada!");
      setShowCriar(false);
      setForm({ tipo: "AQUISICAO", fornecedor: "", data_entrega: "", nota_fiscal: "", quantidade: "", identificacao: "", patrimonio: "", placa: "", chassi: "", modelo: "", local_entrega: "" });
      load();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const mudarStatus = async (e: EntregaObjeto) => {
    const valor = window.prompt("Novo status:", e.status);
    if (!valor) return;
    try {
      await api.atualizarEntrega(convenioId, e.id, { status: valor });
      notify.success("Status atualizado!");
      load();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const inputCls = "w-full border border-surface-border rounded-btn px-3 py-2 text-sm bg-white text-text-title placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-body-sm text-text-body">Entrega do objeto, veículos/equipamentos, inauguração e recebimentos.</p>
        {canEdit && <Button size="sm" icon={Plus} onClick={() => setShowCriar(true)}>Registrar Entrega</Button>}
      </div>

      {loading ? (
        <div className="skeleton h-24 rounded-card" />
      ) : entregas.length === 0 ? (
        <EmptyState icon="file-text" title="Nenhuma entrega" description="Registre a entrega do objeto quando o bem/obra for recebido." />
      ) : (
        <div className="space-y-3">
          {entregas.map((e) => (
            <Card key={e.id} padding="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <PackageCheck className="w-5 h-5 text-[#1D4ED8]" />
                    <span className="text-body font-semibold text-text-title">{e.identificacao || e.fornecedor || "Objeto"}</span>
                    <Badge label={STATUS_ENTREGA_LABELS[e.status] || e.status} color={RECURSOS_STATUS_COLORS[e.status] || "bg-[#F6F7F9] text-[#667085]"} />
                    {e.termo_recebimento && <Badge label="Termo de Recebimento" color="bg-[#067647]/10 text-[#067647]" />}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 text-body-sm">
                    {e.fornecedor && <div><span className="text-meta text-text-subtle">Fornecedor: </span>{e.fornecedor}</div>}
                    {e.nota_fiscal && <div><span className="text-meta text-text-subtle">NF: </span>{e.nota_fiscal}</div>}
                    {e.data_entrega && <div><span className="text-meta text-text-subtle">Data: </span>{formatDate(e.data_entrega)}</div>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1 text-body-sm">
                    {e.quantidade && <div><span className="text-meta text-text-subtle">Qtd: </span>{e.quantidade}</div>}
                    {e.patrimonio && <div><span className="text-meta text-text-subtle">Patrimônio: </span>{e.patrimonio}</div>}
                    {e.placa && <div><span className="text-meta text-text-subtle">Placa: </span>{e.placa}</div>}
                  </div>
                  {(e.chassi || e.modelo) && <p className="text-meta text-text-subtle mt-1">Chassi: {e.chassi || "—"} — Modelo: {e.modelo || "—"}</p>}
                  {e.local_entrega && <p className="text-meta text-text-subtle mt-1">Local: {e.local_entrega}</p>}
                </div>
                {canEdit && <Button variant="secondary" size="sm" onClick={() => mudarStatus(e)}>Mudar Status</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {showCriar && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-card p-6 w-full max-w-lg shadow-elevated max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-h3 text-text-title">Registrar Entrega de Objeto</h3>
              <button onClick={() => setShowCriar(false)} className="text-text-subtle hover:text-text-title"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-label text-text-body mb-1 block">Tipo</label>
                  <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className={inputCls}>
                    <option value="OBRA">Obra</option>
                    <option value="AQUISICAO">Aquisição</option>
                    <option value="SERVICO">Serviço</option>
                    <option value="OUTRO">Outro</option>
                  </select>
                </div>
                <div><label className="text-label text-text-body mb-1 block">Data de entrega</label><input type="date" value={form.data_entrega} onChange={(e) => setForm({ ...form, data_entrega: e.target.value })} className={inputCls} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-label text-text-body mb-1 block">Fornecedor</label><input value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} className={inputCls} /></div>
                <div><label className="text-label text-text-body mb-1 block">Nota fiscal</label><input value={form.nota_fiscal} onChange={(e) => setForm({ ...form, nota_fiscal: e.target.value })} className={inputCls} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><label className="text-label text-text-body mb-1 block">Identificação</label><input value={form.identificacao} onChange={(e) => setForm({ ...form, identificacao: e.target.value })} className={inputCls} /></div>
                <div><label className="text-label text-text-body mb-1 block">Quantidade</label><input type="number" min="1" value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value })} className={inputCls} /></div>
                <div><label className="text-label text-text-body mb-1 block">Patrimônio</label><input value={form.patrimonio} onChange={(e) => setForm({ ...form, patrimonio: e.target.value })} className={inputCls} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><label className="text-label text-text-body mb-1 block">Placa</label><input value={form.placa} onChange={(e) => setForm({ ...form, placa: e.target.value })} className={inputCls} /></div>
                <div><label className="text-label text-text-body mb-1 block">Chassi</label><input value={form.chassi} onChange={(e) => setForm({ ...form, chassi: e.target.value })} className={inputCls} /></div>
                <div><label className="text-label text-text-body mb-1 block">Modelo</label><input value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} className={inputCls} /></div>
              </div>
              <div><label className="text-label text-text-body mb-1 block">Local de entrega</label><input value={form.local_entrega} onChange={(e) => setForm({ ...form, local_entrega: e.target.value })} className={inputCls} /></div>
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
