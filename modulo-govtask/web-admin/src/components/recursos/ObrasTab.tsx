"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { notify } from "@/components/ui/Toast";
import { formatCurrency, formatDate, RECURSOS_STATUS_COLORS } from "@/lib/utils";
import type { Obra } from "@/types/govtask";
import { Plus, X, ClipboardList, Camera, ChevronDown, ChevronUp } from "lucide-react";

type Props = { convenioId: string; canEdit: boolean };

export function ObrasTab({ convenioId, canEdit }: Props) {
  const [obras, setObras] = useState<Obra[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCriar, setShowCriar] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({
    nome: "", endereco: "", empresa: "", cnpj_empresa: "", contrato_numero: "", responsavel_tecnico: "", valor_contrato: "", data_inicio: "", previsao_conclusao: "",
  });
  const [cronItem, setCronItem] = useState<{ obraId: string; descricao: string; valor: string; percentual_previsto: string; percentual_realizado: string }>({ obraId: "", descricao: "", valor: "", percentual_previsto: "", percentual_realizado: "" });
  const [diario, setDiario] = useState<{ obraId: string; tipo: string; titulo: string; descricao: string }>({ obraId: "", tipo: "VISITA", titulo: "", descricao: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setObras(await api.listObras(convenioId));
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [convenioId]);

  useEffect(() => { load(); }, [load]);

  const criar = async () => {
    try {
      await api.criarObra(convenioId, {
        nome: form.nome || undefined,
        endereco: form.endereco || undefined,
        empresa: form.empresa || undefined,
        cnpj_empresa: form.cnpj_empresa || undefined,
        contrato_numero: form.contrato_numero || undefined,
        responsavel_tecnico: form.responsavel_tecnico || undefined,
        valor_contrato: form.valor_contrato ? Number(form.valor_contrato) : undefined,
        data_inicio: form.data_inicio || undefined,
        previsao_conclusao: form.previsao_conclusao || undefined,
        situacao: "EM_ANDAMENTO",
      });
      notify.success("Obra cadastrada!");
      setShowCriar(false);
      setForm({ nome: "", endereco: "", empresa: "", cnpj_empresa: "", contrato_numero: "", responsavel_tecnico: "", valor_contrato: "", data_inicio: "", previsao_conclusao: "" });
      load();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const addCronograma = async () => {
    if (!cronItem.descricao.trim()) return notify.error("Informe a descrição do item");
    try {
      await api.adicionarCronograma(convenioId, cronItem.obraId, {
        descricao: cronItem.descricao,
        valor: cronItem.valor ? Number(cronItem.valor) : undefined,
        percentual_previsto: cronItem.percentual_previsto ? Number(cronItem.percentual_previsto) : undefined,
        percentual_realizado: cronItem.percentual_realizado ? Number(cronItem.percentual_realizado) : undefined,
      });
      notify.success("Item do cronograma adicionado!");
      setCronItem({ obraId: "", descricao: "", valor: "", percentual_previsto: "", percentual_realizado: "" });
      load();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const addDiario = async () => {
    if (!diario.titulo.trim()) return notify.error("Informe o título do registro");
    try {
      await api.registrarDiario(convenioId, diario.obraId, {
        tipo: diario.tipo,
        titulo: diario.titulo,
        descricao: diario.descricao || undefined,
      });
      notify.success("Registro no diário adicionado!");
      setDiario({ obraId: "", tipo: "VISITA", titulo: "", descricao: "" });
      load();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const inputCls = "w-full border border-surface-border rounded-btn px-3 py-2 text-sm bg-white text-text-title placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]";
  const progress = (pct: number | null) => (pct == null ? 0 : Math.min(100, Math.max(0, pct)));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-body-sm text-text-body">Obras, cronograma físico-financeiro, diário e registro fotográfico.</p>
        {canEdit && <Button size="sm" icon={Plus} onClick={() => setShowCriar(true)}>Cadastrar Obra</Button>}
      </div>

      {loading ? (
        <div className="skeleton h-32 rounded-card" />
      ) : obras.length === 0 ? (
        <EmptyState icon="file-text" title="Nenhuma obra" description="Cadastre a obra vinculada ao recurso para acompanhar execução, medições e diário." />
      ) : (
        <div className="space-y-3">
          {obras.map((o) => (
            <Card key={o.id} padding="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <ClipboardList className="w-5 h-5 text-[#1D4ED8]" />
                    <span className="text-body font-semibold text-text-title">{o.nome || "Obra"}</span>
                    <Badge label={o.situacao ? o.situacao.replace("_", " ") : "—"} color={o.situacao ? (RECURSOS_STATUS_COLORS[o.situacao] || "bg-[#F6F7F9] text-[#667085]") : "bg-[#F6F7F9] text-[#667085]"} />
                  </div>
                  {o.endereco && <p className="text-body-sm text-text-body mt-1">{o.endereco}</p>}
                  {o.empresa && <p className="text-body-sm text-text-body mt-0.5">Empresa: {o.empresa}{o.cnpj_empresa ? ` (${o.cnpj_empresa})` : ""}</p>}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-body-sm">
                    <div><span className="text-meta text-text-subtle">Contrato: </span><span className="tabular-nums text-text-title">{formatCurrency(o.valor_contrato)}</span></div>
                    <div><span className="text-meta text-text-subtle">Físico: </span>{o.percentual_fisico ?? 0}%</div>
                    <div><span className="text-meta text-text-subtle">Financeiro: </span>{o.percentual_financeiro ?? 0}%</div>
                    {o.previsao_conclusao && <div><span className="text-meta text-text-subtle">Previsão: </span>{formatDate(o.previsao_conclusao)}</div>}
                  </div>
                </div>
                <Button variant="ghost" size="sm" icon={expanded === o.id ? ChevronUp : ChevronDown} onClick={() => setExpanded(expanded === o.id ? null : o.id)}>
                  Detalhes
                </Button>
              </div>

              {expanded === o.id && (
                <div className="mt-4 pt-4 border-t border-surface-border space-y-5">
                  {/* Cronograma */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-label font-medium text-text-title">Cronograma Físico-Financeiro</h4>
                      {canEdit && (
                        <div className="flex gap-1 flex-wrap">
                          <input value={cronItem.descricao} onChange={(e) => setCronItem({ ...cronItem, obraId: o.id, descricao: e.target.value })} placeholder="Item" className="input-sm" />
                          <input value={cronItem.valor} onChange={(e) => setCronItem({ ...cronItem, obraId: o.id, valor: e.target.value })} placeholder="Valor" className="input-sm w-20" />
                          <input value={cronItem.percentual_previsto} onChange={(e) => setCronItem({ ...cronItem, obraId: o.id, percentual_previsto: e.target.value })} placeholder="%" className="input-sm w-12" />
                          <Button size="sm" icon={Plus} onClick={() => { setCronItem({ ...cronItem, obraId: o.id }); addCronograma(); }}>+</Button>
                        </div>
                      )}
                    </div>
                    {o.cronograma.length === 0 ? (
                      <p className="text-body-sm text-text-subtle">Nenhum item de cronograma.</p>
                    ) : (
                      <div className="space-y-2">
                        {o.cronograma.map((item) => (
                          <div key={item.id} className="p-2 bg-[#F6F7F9] rounded-btn">
                            <div className="flex items-center justify-between text-body-sm">
                              <span className="font-medium text-text-title">{item.descricao}</span>
                              <div className="flex items-center gap-3">
                                <span className="tabular-nums text-text-body">{formatCurrency(item.valor)}</span>
                                <span className="text-meta text-text-subtle">Prev: {item.percentual_previsto ?? 0}%</span>
                                <span className="text-meta text-[#067647]">Real: {item.percentual_realizado ?? 0}%</span>
                              </div>
                            </div>
                            <div className="h-1.5 bg-[#E4E7EC] rounded-pill overflow-hidden mt-1">
                              <div className="h-full bg-[#1D4ED8]" style={{ width: `${progress(item.percentual_realizado)}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Diário */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-label font-medium text-text-title">Diário da Obra</h4>
                      {canEdit && (
                        <div className="flex gap-1 flex-wrap">
                          <select value={diario.tipo} onChange={(e) => setDiario({ ...diario, obraId: o.id, tipo: e.target.value })} className="input-sm">
                            {["VISITA", "OCORRENCIA", "CHUVA", "PARALISACAO", "AVANCO", "PROBLEMA_TECNICO", "DETERMINACAO", "FISCALIZACAO", "REUNIAO", "NOTIFICACAO"].map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
                          </select>
                          <input value={diario.titulo} onChange={(e) => setDiario({ ...diario, obraId: o.id, titulo: e.target.value })} placeholder="Título" className="input-sm" />
                          <Button size="sm" icon={Plus} onClick={() => { setDiario({ ...diario, obraId: o.id }); addDiario(); }}>+</Button>
                        </div>
                      )}
                    </div>
                    <DiarioList convenioId={convenioId} obraId={o.id} />
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
              <h3 className="text-h3 text-text-title">Cadastrar Obra</h3>
              <button onClick={() => setShowCriar(false)} className="text-text-subtle hover:text-text-title"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-label text-text-body mb-1 block">Nome</label><input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={inputCls} /></div>
                <div><label className="text-label text-text-body mb-1 block">Contrato nº</label><input value={form.contrato_numero} onChange={(e) => setForm({ ...form, contrato_numero: e.target.value })} className={inputCls} /></div>
              </div>
              <div><label className="text-label text-text-body mb-1 block">Endereço</label><input value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} className={inputCls} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-label text-text-body mb-1 block">Empresa</label><input value={form.empresa} onChange={(e) => setForm({ ...form, empresa: e.target.value })} className={inputCls} /></div>
                <div><label className="text-label text-text-body mb-1 block">CNPJ</label><input value={form.cnpj_empresa} onChange={(e) => setForm({ ...form, cnpj_empresa: e.target.value })} className={inputCls} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-label text-text-body mb-1 block">Responsável técnico</label><input value={form.responsavel_tecnico} onChange={(e) => setForm({ ...form, responsavel_tecnico: e.target.value })} className={inputCls} /></div>
                <div><label className="text-label text-text-body mb-1 block">Valor contrato (R$)</label><input type="number" step="0.01" value={form.valor_contrato} onChange={(e) => setForm({ ...form, valor_contrato: e.target.value })} className={inputCls} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-label text-text-body mb-1 block">Data início</label><input type="date" value={form.data_inicio} onChange={(e) => setForm({ ...form, data_inicio: e.target.value })} className={inputCls} /></div>
                <div><label className="text-label text-text-body mb-1 block">Previsão conclusão</label><input type="date" value={form.previsao_conclusao} onChange={(e) => setForm({ ...form, previsao_conclusao: e.target.value })} className={inputCls} /></div>
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

function DiarioList({ convenioId, obraId }: { convenioId: string; obraId: string }) {
  const [itens, setItens] = useState<import("@/types/govtask").DiarioObra[]>([]);
  useEffect(() => {
    api.listDiario(convenioId, obraId).then(setItens).catch(() => {});
  }, [convenioId, obraId]);
  if (itens.length === 0) return <p className="text-body-sm text-text-subtle">Nenhum registro no diário.</p>;
  return (
    <div className="space-y-1">
      {itens.slice(0, 5).map((d) => (
        <div key={d.id} className="flex items-center gap-2 text-body-sm p-1.5 bg-[#F6F7F9] rounded-btn">
          <Badge label={d.tipo.replace("_", " ")} color="bg-[#1D4ED8]/10 text-[#1D4ED8]" />
          <span className="text-text-title font-medium">{d.titulo || d.tipo}</span>
          <span className="text-meta text-text-subtle">{formatDate(d.data || d.created_at)}</span>
        </div>
      ))}
    </div>
  );
}
