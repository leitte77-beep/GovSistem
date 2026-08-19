"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { notify } from "@/components/ui/Toast";
import { cn, formatCurrency, formatDate, RECURSOS_STATUS_COLORS } from "@/lib/utils";
import type {
  Obra,
  DiarioObra,
  VistoriaObra,
  RegistroFoto,
  Medicao,
} from "@/types/govtask";
import {
  Plus, X, ClipboardList, Calendar, Image as ImageIcon, Search, CheckCircle2,
  NotebookPen, Camera, Ruler, ChevronDown, ChevronUp, Trash2,
} from "lucide-react";
import { VISTORIA_TIPOS, VISTORIA_STATUS } from "@/types/govtask";

type Props = { convenioId: string; canEdit: boolean };

type SubTab = "diario" | "vistorias" | "fotos" | "medicoes";

const DIARIO_LABELS: Record<string, string> = {
  VISITA: "Visita", OCORRENCIA: "Ocorrência", CHUVA: "Chuva", PARALISACAO: "Paralisação",
  AVANCO: "Avanço", PROBLEMA_TECNICO: "Problema técnico", DETERMINACAO: "Determinação",
  FISCALIZACAO: "Fiscalização", REUNIAO: "Reunião", NOTIFICACAO: "Notificação",
};
const MEDICAO_STATUS_COLORS: Record<string, string> = {
  REGISTRADA: "bg-[#1D4ED8]/10 text-[#1D4ED8]",
  EM_ANALISE: "bg-[#B54708]/10 text-[#B54708]",
  APROVADA: "bg-[#067647]/10 text-[#067647]",
  REPROVADA: "bg-[#B42318]/10 text-[#B42318]",
  PAGA: "bg-[#067647]/10 text-[#067647]",
};

export function ObrasTab({ convenioId, canEdit }: Props) {
  const [obras, setObras] = useState<Obra[]>([]);
  const [medicoes, setMedicoes] = useState<Medicao[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCriar, setShowCriar] = useState(false);
  const [activeSub, setActiveSub] = useState<SubTab>("diario");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({
    nome: "", endereco: "", empresa: "", cnpj_empresa: "", contrato_numero: "",
    responsavel_tecnico: "", valor_contrato: "", data_inicio: "", previsao_conclusao: "",
  });
  const [cronItem, setCronItem] = useState<{ obraId: string; descricao: string; valor: string; percentual_previsto: string; percentual_realizado: string }>({ obraId: "", descricao: "", valor: "", percentual_previsto: "", percentual_realizado: "" });
  const [diarioForm, setDiarioForm] = useState<{ obraId: string; tipo: string; titulo: string; descricao: string }>({ obraId: "", tipo: "AVANCO", titulo: "", descricao: "" });
  const [vistoriaForm, setVistoriaForm] = useState<{ obraId: string; data: string; tipo: string; vistoriador: string; orgao_vistoriador: string; status: string; observacoes: string; nao_conformidades: string; recomendacoes: string }>({ obraId: "", data: "", tipo: "ROTINEIRA", vistoriador: "", orgao_vistoriador: "", status: "AGENDADA", observacoes: "", nao_conformidades: "", recomendacoes: "" });
  const [fotoForm, setFotoForm] = useState<{ obraId: string; etapa: string; observacao: string }>({ obraId: "", etapa: "", observacao: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, m] = await Promise.all([
        api.listObras(convenioId),
        api.listMedicoes(convenioId),
      ]);
      setObras(o);
      setMedicoes(m);
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [convenioId]);

  useEffect(() => { load(); }, [load]);

  const totalDiario = useMemo(() => obras.reduce((acc, o) => acc + (o as any).diario?.length || 0, 0), [obras]);
  const totalFotos = useMemo(() => obras.reduce((acc, o) => acc + (o as any).fotos?.length || 0, 0), [obras]);

  const subTabs: { key: SubTab; label: string; count: number; icon: React.ReactNode; desc: string }[] = [
    { key: "diario", label: "Diário de Obra", count: totalDiario, icon: <NotebookPen className="w-4 h-4" />, desc: "Registros diários do canteiro: atividades, equipe, condições e ocorrências." },
    { key: "vistorias", label: "Vistorias", count: 0, icon: <Search className="w-4 h-4" />, desc: "Vistorias e inspeções da obra (rotineiras, recebimento, fiscalização)." },
    { key: "fotos", label: "Fotos", count: totalFotos, icon: <Camera className="w-4 h-4" />, desc: "Registro fotográfico da evolução da obra." },
    { key: "medicoes", label: "Medições", count: medicoes.length, icon: <Ruler className="w-4 h-4" />, desc: "Medições e pagamentos da obra." },
  ];

  const criar = async () => {
    try {
      await api.criarObra(convenioId, {
        nome: form.nome || undefined, endereco: form.endereco || undefined,
        empresa: form.empresa || undefined, cnpj_empresa: form.cnpj_empresa || undefined,
        contrato_numero: form.contrato_numero || undefined,
        responsavel_tecnico: form.responsavel_tecnico || undefined,
        valor_contrato: form.valor_contrato ? Number(form.valor_contrato) : undefined,
        data_inicio: form.data_inicio || undefined, previsao_conclusao: form.previsao_conclusao || undefined,
        situacao: "EM_ANDAMENTO",
      });
      notify.success("Obra cadastrada!");
      setShowCriar(false);
      setForm({ nome: "", endereco: "", empresa: "", cnpj_empresa: "", contrato_numero: "", responsavel_tecnico: "", valor_contrato: "", data_inicio: "", previsao_conclusao: "" });
      load();
    } catch (e: any) { notify.error(e.message); }
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
    } catch (e: any) { notify.error(e.message); }
  };

  const addDiario = async () => {
    if (!diarioForm.titulo.trim()) return notify.error("Informe o título do registro");
    try {
      await api.registrarDiario(convenioId, diarioForm.obraId, {
        tipo: diarioForm.tipo, titulo: diarioForm.titulo, descricao: diarioForm.descricao || undefined,
      });
      notify.success("Registro no diário adicionado!");
      setDiarioForm({ obraId: "", tipo: "AVANCO", titulo: "", descricao: "" });
      load();
    } catch (e: any) { notify.error(e.message); }
  };

  const addVistoria = async () => {
    if (!vistoriaForm.obraId) return notify.error("Selecione a obra");
    try {
      await api.registrarVistoria(convenioId, vistoriaForm.obraId, {
        data: vistoriaForm.data || undefined, tipo: vistoriaForm.tipo,
        vistoriador: vistoriaForm.vistoriador || undefined,
        orgao_vistoriador: vistoriaForm.orgao_vistoriador || undefined,
        status: vistoriaForm.status, observacoes: vistoriaForm.observacoes || undefined,
        nao_conformidades: vistoriaForm.nao_conformidades || undefined,
        recomendacoes: vistoriaForm.recomendacoes || undefined,
      });
      notify.success("Vistoria registrada!");
      setVistoriaForm({ obraId: "", data: "", tipo: "ROTINEIRA", vistoriador: "", orgao_vistoriador: "", status: "AGENDADA", observacoes: "", nao_conformidades: "", recomendacoes: "" });
      load();
    } catch (e: any) { notify.error(e.message); }
  };

  const addFoto = async () => {
    if (!fotoForm.obraId) return notify.error("Selecione a obra");
    try {
      await api.registrarFoto(convenioId, fotoForm.obraId, {
        etapa: fotoForm.etapa || undefined, observacao: fotoForm.observacao || undefined,
      });
      notify.success("Registro fotográfico adicionado!");
      setFotoForm({ obraId: "", etapa: "", observacao: "" });
      load();
    } catch (e: any) { notify.error(e.message); }
  };

  const inputCls = "w-full border border-surface-border rounded-btn px-3 py-2 text-sm bg-white text-text-title placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]";
  const inputSm = "border border-surface-border rounded-btn px-2 py-1.5 text-sm bg-white text-text-title placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]";
  const progress = (pct: number | null) => (pct == null ? 0 : Math.min(100, Math.max(0, pct)));

  const activeTabInfo = subTabs.find((s) => s.key === activeSub)!;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-body-sm text-text-body">Diário de obra, vistorias, fotos e medições da execução.</p>
        {canEdit && <Button size="sm" icon={Plus} onClick={() => setShowCriar(true)}>Cadastrar Obra</Button>}
      </div>

      {loading ? (
        <div className="skeleton h-32 rounded-card" />
      ) : (
        <>
          {/* Sub-abas com contadores */}
          <div className="flex flex-wrap gap-2">
            {subTabs.map((st) => (
              <button
                key={st.key}
                onClick={() => setActiveSub(st.key)}
                className={cn(
                  "inline-flex items-center gap-2 px-3.5 py-2 rounded-pill border text-body-sm font-medium transition-colors",
                  activeSub === st.key
                    ? "bg-[#1D4ED8]/10 text-[#1D4ED8] border-[#1D4ED8]/30"
                    : "bg-white text-text-subtle border-surface-border hover:border-text-subtle"
                )}
              >
                {st.icon}
                {st.label}
                <span className={cn(
                  "inline-flex items-center justify-center rounded-full px-2 py-0.5 text-meta font-semibold",
                  activeSub === st.key ? "bg-[#1D4ED8] text-white" : "bg-[#F6F7F9] text-[#98A2B3]"
                )}>{st.count}</span>
              </button>
            ))}
          </div>

          {/* Descrição da sub-aba */}
          <p className="text-meta text-text-subtle">{activeTabInfo.desc}</p>

          {/* Diário de Obra */}
          {activeSub === "diario" && (
            <div className="space-y-3">
              {obras.length === 0 && <EmptyState icon="file-text" title="Nenhuma obra" description="Cadastre a obra vinculada ao recurso." />}
              {obras.map((o) => (
                <Card key={o.id} padding="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="w-4 h-4 text-[#1D4ED8]" />
                      <span className="text-body font-semibold text-text-title">{o.nome || "Obra"}</span>
                      {o.situacao && <Badge label={o.situacao.replace("_", " ")} color={RECURSOS_STATUS_COLORS[o.situacao] || "bg-[#F6F7F9] text-[#667085]"} />}
                    </div>
                    <Button variant="ghost" size="sm" icon={expanded === o.id ? ChevronUp : ChevronDown} onClick={() => setExpanded(expanded === o.id ? null : o.id)}>Detalhes</Button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-body-sm">
                    <div><span className="text-meta text-text-subtle">Contrato: </span><span className="tabular-nums text-text-title">{formatCurrency(o.valor_contrato)}</span></div>
                    <div><span className="text-meta text-text-subtle">Físico: </span>{o.percentual_fisico ?? 0}%</div>
                    <div><span className="text-meta text-text-subtle">Financeiro: </span>{o.percentual_financeiro ?? 0}%</div>
                    {o.previsao_conclusao && <div><span className="text-meta text-text-subtle">Previsão: </span>{formatDate(o.previsao_conclusao)}</div>}
                  </div>

                  <DiarioSection convenioId={convenioId} obraId={o.id} obraNome={o.nome || "Obra"} canEdit={canEdit} />

                  {expanded === o.id && (
                    <div className="mt-4 pt-4 border-t border-surface-border">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-label font-medium text-text-title">Cronograma Físico-Financeiro</h4>
                        {canEdit && (
                          <div className="flex gap-1 flex-wrap">
                            <input value={cronItem.descricao} onChange={(e) => setCronItem({ ...cronItem, obraId: o.id, descricao: e.target.value })} placeholder="Item" className={inputSm} />
                            <input value={cronItem.valor} onChange={(e) => setCronItem({ ...cronItem, obraId: o.id, valor: e.target.value })} placeholder="Valor" className={cn(inputSm, "w-20")} />
                            <input value={cronItem.percentual_previsto} onChange={(e) => setCronItem({ ...cronItem, obraId: o.id, percentual_previsto: e.target.value })} placeholder="%" className={cn(inputSm, "w-12")} />
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
                  )}
                </Card>
              ))}

              {canEdit && obras.length > 0 && (
                <Card padding="p-4">
                  <h4 className="text-label font-medium text-text-title mb-2">Novo registro no diário</h4>
                  <div className="flex flex-wrap gap-2">
                    <select value={diarioForm.obraId} onChange={(e) => setDiarioForm({ ...diarioForm, obraId: e.target.value })} className={inputSm}>
                      <option value="">Selecione a obra</option>
                      {obras.map((o) => <option key={o.id} value={o.id}>{o.nome || "Obra"}</option>)}
                    </select>
                    <select value={diarioForm.tipo} onChange={(e) => setDiarioForm({ ...diarioForm, tipo: e.target.value })} className={inputSm}>
                      {Object.entries(DIARIO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <input value={diarioForm.titulo} onChange={(e) => setDiarioForm({ ...diarioForm, titulo: e.target.value })} placeholder="Título" className={cn(inputSm, "flex-1 min-w-[160px]")} />
                    <Button size="sm" icon={Plus} onClick={() => { setDiarioForm({ ...diarioForm, obraId: diarioForm.obraId }); addDiario(); }}>Adicionar</Button>
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* Vistorias */}
          {activeSub === "vistorias" && (
            <div className="space-y-3">
              {obras.length === 0 ? (
                <EmptyState icon="search" title="Nenhuma obra" description="Cadastre a obra para registrar vistorias." />
              ) : (
                obras.map((o) => (
                  <VistoriasSection key={o.id} convenioId={convenioId} obraId={o.id} obraNome={o.nome || "Obra"} canEdit={canEdit} />
                ))
              )}
              {canEdit && obras.length > 0 && (
                <Card padding="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Search className="w-4 h-4 text-[#1D4ED8]" />
                    <h4 className="text-label font-medium text-text-title">Nova vistoria</h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <select value={vistoriaForm.obraId} onChange={(e) => setVistoriaForm({ ...vistoriaForm, obraId: e.target.value })} className={inputSm}>
                      <option value="">Obra</option>
                      {obras.map((ob) => <option key={ob.id} value={ob.id}>{ob.nome || "Obra"}</option>)}
                    </select>
                    <input type="date" value={vistoriaForm.data} onChange={(e) => setVistoriaForm({ ...vistoriaForm, data: e.target.value })} className={inputSm} />
                    <select value={vistoriaForm.tipo} onChange={(e) => setVistoriaForm({ ...vistoriaForm, tipo: e.target.value })} className={inputSm}>
                      {VISTORIA_TIPOS.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
                    </select>
                    <input value={vistoriaForm.vistoriador} onChange={(e) => setVistoriaForm({ ...vistoriaForm, vistoriador: e.target.value })} placeholder="Vistoriador" className={inputSm} />
                    <input value={vistoriaForm.orgao_vistoriador} onChange={(e) => setVistoriaForm({ ...vistoriaForm, orgao_vistoriador: e.target.value })} placeholder="Órgão vistoriador" className={inputSm} />
                    <select value={vistoriaForm.status} onChange={(e) => setVistoriaForm({ ...vistoriaForm, status: e.target.value })} className={inputSm}>
                      {VISTORIA_STATUS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                    <textarea value={vistoriaForm.observacoes} onChange={(e) => setVistoriaForm({ ...vistoriaForm, observacoes: e.target.value })} placeholder="Observações" rows={2} className={inputSm} />
                    <textarea value={vistoriaForm.nao_conformidades} onChange={(e) => setVistoriaForm({ ...vistoriaForm, nao_conformidades: e.target.value })} placeholder="Não conformidades" rows={2} className={inputSm} />
                    <textarea value={vistoriaForm.recomendacoes} onChange={(e) => setVistoriaForm({ ...vistoriaForm, recomendacoes: e.target.value })} placeholder="Recomendações" rows={2} className={inputSm} />
                  </div>
                  <div className="flex justify-end mt-2">
                    <Button size="sm" icon={Plus} onClick={addVistoria}>Registrar Vistoria</Button>
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* Fotos */}
          {activeSub === "fotos" && (
            <div className="space-y-3">
              {obras.length === 0 ? (
                <EmptyState icon="image" title="Nenhuma obra" description="Cadastre a obra para registrar fotos." />
              ) : (
                obras.map((o) => (
                  <FotosSection key={o.id} convenioId={convenioId} obraId={o.id} obraNome={o.nome || "Obra"} canEdit={canEdit} />
                ))
              )}
              {canEdit && obras.length > 0 && (
                <Card padding="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Camera className="w-4 h-4 text-[#1D4ED8]" />
                    <h4 className="text-label font-medium text-text-title">Novo registro fotográfico</h4>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select value={fotoForm.obraId} onChange={(e) => setFotoForm({ ...fotoForm, obraId: e.target.value })} className={inputSm}>
                      <option value="">Obra</option>
                      {obras.map((ob) => <option key={ob.id} value={ob.id}>{ob.nome || "Obra"}</option>)}
                    </select>
                    <input value={fotoForm.etapa} onChange={(e) => setFotoForm({ ...fotoForm, etapa: e.target.value })} placeholder="Etapa (ex.: Estrutura, Canteiro)" className={cn(inputSm, "flex-1 min-w-[180px]")} />
                    <input value={fotoForm.observacao} onChange={(e) => setFotoForm({ ...fotoForm, observacao: e.target.value })} placeholder="Observação" className={cn(inputSm, "flex-1 min-w-[180px]")} />
                    <Button size="sm" icon={Plus} onClick={addFoto}>Adicionar</Button>
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* Medições */}
          {activeSub === "medicoes" && (
            <Card padding="p-5">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-label font-medium text-text-title">Medições e pagamentos da obra</h4>
                {medicoes.length > 0 && (
                  <span className="text-body font-bold text-text-title tabular-nums">
                    {formatCurrency(medicoes.reduce((acc, m) => acc + (m.valor || 0), 0))}
                  </span>
                )}
              </div>
              {medicoes.length === 0 ? (
                <p className="text-body-sm text-text-subtle text-center py-4">Nenhuma medição registrada.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-meta text-text-subtle text-left border-b border-surface-border">
                        <th className="py-2 pr-3">Nº</th>
                        <th className="py-2 pr-3">Data</th>
                        <th className="py-2 pr-3">Período</th>
                        <th className="py-2 pr-3 text-right">Valor</th>
                        <th className="py-2 pr-3 text-right">% acumulado</th>
                        <th className="py-2 pr-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {medicoes.map((m) => (
                        <tr key={m.id} className="border-b border-surface-border last:border-0">
                          <td className="py-2 pr-3 font-medium text-text-title">{m.numero}</td>
                          <td className="py-2 pr-3 text-text-body">{formatDate(m.data || m.created_at)}</td>
                          <td className="py-2 pr-3 text-text-body">{m.periodo_inicio ? `${formatDate(m.periodo_inicio)} a ${formatDate(m.periodo_fim)}` : "—"}</td>
                          <td className="py-2 pr-3 text-right tabular-nums text-text-title font-medium">{formatCurrency(m.valor)}</td>
                          <td className="py-2 pr-3 text-right tabular-nums text-text-title">{m.percentual_acumulado ?? 0}%</td>
                          <td className="py-2 pr-3"><Badge label={(m.status || "").replace("_", " ")} color={MEDICAO_STATUS_COLORS[m.status] || "bg-[#F6F7F9] text-[#667085]"} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </>
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

function DiarioSection({ convenioId, obraId, obraNome, canEdit }: { convenioId: string; obraId: string; obraNome: string; canEdit: boolean }) {
  const [itens, setItens] = useState<DiarioObra[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    api.listDiario(convenioId, obraId).then(setItens).catch(() => {}).finally(() => setLoading(false));
  }, [convenioId, obraId]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="mt-3 pt-3 border-t border-surface-border">
      <div className="flex items-center gap-1.5 mb-2">
        <NotebookPen className="w-4 h-4 text-[#1D4ED8]" />
        <h4 className="text-label font-medium text-text-title">Diário — {obraNome}</h4>
        <span className="text-meta text-text-subtle">({itens.length})</span>
      </div>
      {loading ? (
        <div className="skeleton h-16 rounded-btn" />
      ) : itens.length === 0 ? (
        <p className="text-body-sm text-text-subtle">Nenhum registro no diário.</p>
      ) : (
        <div className="space-y-2">
          {itens.slice(0, 8).map((d) => (
            <div key={d.id} className="p-3 bg-[#F6F7F9] rounded-btn">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge label={DIARIO_LABELS[d.tipo] || d.tipo.replace("_", " ")} color="bg-[#1D4ED8]/10 text-[#1D4ED8]" />
                <span className="text-body-sm font-medium text-text-title">{d.titulo || d.tipo}</span>
                <span className="text-meta text-text-subtle">{formatDate(d.data || d.created_at)}</span>
              </div>
              {d.descricao && <p className="text-body-sm text-text-body mt-1">{d.descricao}</p>}
            </div>
          ))}
          {itens.length > 8 && <p className="text-meta text-text-subtle">+ {itens.length - 8} registro(s)</p>}
        </div>
      )}
    </div>
  );
}

function VistoriasSection({ convenioId, obraId, obraNome, canEdit }: { convenioId: string; obraId: string; obraNome: string; canEdit: boolean }) {
  const [itens, setItens] = useState<VistoriaObra[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    api.listVistorias(convenioId, obraId).then(setItens).catch(() => {}).finally(() => setLoading(false));
  }, [convenioId, obraId]);
  useEffect(() => { load(); }, [load]);

  return (
    <Card padding="p-4">
      <div className="flex items-center gap-1.5 mb-2">
        <Search className="w-4 h-4 text-[#1D4ED8]" />
        <h4 className="text-label font-medium text-text-title">Vistorias — {obraNome}</h4>
        <span className="text-meta text-text-subtle">({itens.length})</span>
      </div>
      {loading ? (
        <div className="skeleton h-16 rounded-btn" />
      ) : itens.length === 0 ? (
        <p className="text-body-sm text-text-subtle">Nenhuma vistoria registrada.</p>
      ) : (
        <div className="space-y-2">
          {itens.map((v) => (
            <div key={v.id} className="p-3 bg-[#F6F7F9] rounded-btn">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge label={(v.tipo || "ROTINEIRA").replace("_", " ")} color="bg-[#1D4ED8]/10 text-[#1D4ED8]" />
                <span className="text-body-sm font-medium text-text-title">{v.vistoriador || "—"}</span>
                {v.orgao_vistoriador && <span className="text-meta text-text-subtle">· {v.orgao_vistoriador}</span>}
                <span className="text-meta text-text-subtle">{formatDate(v.data || v.created_at)}</span>
                <Badge label={(v.status || "").replace("_", " ")} color={RECURSOS_STATUS_COLORS[v.status || ""] || "bg-[#F6F7F9] text-[#667085]"} />
              </div>
              {v.observacoes && <p className="text-body-sm text-text-body mt-1"><strong>Observações:</strong> {v.observacoes}</p>}
              {v.nao_conformidades && <p className="text-body-sm text-[#B42318] mt-1"><strong>Não conformidades:</strong> {v.nao_conformidades}</p>}
              {v.recomendacoes && <p className="text-body-sm text-text-body mt-1"><strong>Recomendações:</strong> {v.recomendacoes}</p>}
              {v.protocolo && <p className="text-meta text-text-subtle mt-1">Protocolo: {v.protocolo}</p>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function FotosSection({ convenioId, obraId, obraNome, canEdit }: { convenioId: string; obraId: string; obraNome: string; canEdit: boolean }) {
  const [itens, setItens] = useState<RegistroFoto[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    api.listFotos(convenioId, obraId).then(setItens).catch(() => {}).finally(() => setLoading(false));
  }, [convenioId, obraId]);

  return (
    <Card padding="p-4">
      <div className="flex items-center gap-1.5 mb-2">
        <Camera className="w-4 h-4 text-[#1D4ED8]" />
        <h4 className="text-label font-medium text-text-title">Fotos — {obraNome}</h4>
        <span className="text-meta text-text-subtle">({itens.length})</span>
      </div>
      {loading ? (
        <div className="skeleton h-16 rounded-btn" />
      ) : itens.length === 0 ? (
        <p className="text-body-sm text-text-subtle">Nenhum registro fotográfico.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {itens.map((f) => (
            <div key={f.id} className="p-3 bg-[#F6F7F9] rounded-btn flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-lg bg-[#1D4ED8]/10 flex items-center justify-center mb-1">
                <ImageIcon className="w-5 h-5 text-[#1D4ED8]" />
              </div>
              <span className="text-body-sm font-medium text-text-title">{f.etapa || "Sem etapa"}</span>
              {f.observacao && <span className="text-meta text-text-subtle mt-0.5 line-clamp-2">{f.observacao}</span>}
              <span className="text-meta text-text-subtle mt-1">{formatDate(f.data || f.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
