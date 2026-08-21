"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { notify } from "@/components/ui/Toast";
import {
  cn,
  formatCurrency,
  formatDate,
  pct,
  pctLabel,
  RECURSOS_STATUS_COLORS,
  STATUS_MEDICAO_LABELS,
} from "@/lib/utils";
import type { Obra, DiarioObra, VistoriaObra, RegistroFoto, Medicao } from "@/types/govtask";
import { VISTORIA_TIPOS, VISTORIA_STATUS } from "@/types/govtask";
import {
  Plus,
  NotebookPen,
  ClipboardCheck,
  Camera,
  Ruler,
  Pencil,
  Trash2,
  Users,
  Cloud,
  ImageIcon,
} from "lucide-react";

type Props = { convenioId: string; canEdit: boolean };
type SubTab = "diario" | "vistorias" | "fotos" | "medicoes";

const CLIMAS = ["Ensolarado", "Nublado", "Chuvoso", "Parcialmente nublado", "Ventania"];

const hoje = () => new Date().toISOString().slice(0, 10);

const DIARIO_VAZIO = {
  data: hoje(),
  clima: "Ensolarado",
  efetivo: "0",
  temperatura: "",
  equipe: "",
  atividades: "",
  equipamentos: "",
  ocorrencias: "",
  impedimentos: "",
};

const VISTORIA_VAZIA = {
  data: hoje(),
  tipo: "ROTINEIRA",
  vistoriador: "",
  orgao_vistoriador: "",
  status: "AGENDADA",
  protocolo: "",
  observacoes: "",
  nao_conformidades: "",
  recomendacoes: "",
};

const MEDICAO_VAZIA = {
  numero: "",
  data: hoje(),
  periodo: "",
  valor: "",
  percentual: "",
  percentual_acumulado: "",
  status: "REGISTRADA",
};

export function ObrasTab({ convenioId, canEdit }: Props) {
  const [obras, setObras] = useState<Obra[]>([]);
  const [obraId, setObraId] = useState<string>("");
  const [diario, setDiario] = useState<DiarioObra[]>([]);
  const [vistorias, setVistorias] = useState<VistoriaObra[]>([]);
  const [fotos, setFotos] = useState<RegistroFoto[]>([]);
  const [medicoes, setMedicoes] = useState<Medicao[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSub, setActiveSub] = useState<SubTab>("diario");

  const [showObraForm, setShowObraForm] = useState(false);
  const [obraForm, setObraForm] = useState({ nome: "", endereco: "", empresa: "", contrato_numero: "" });

  const [showDiarioForm, setShowDiarioForm] = useState(false);
  const [diarioEdit, setDiarioEdit] = useState<string | null>(null);
  const [diarioForm, setDiarioForm] = useState({ ...DIARIO_VAZIO });

  const [showVistoriaForm, setShowVistoriaForm] = useState(false);
  const [vistoriaEdit, setVistoriaEdit] = useState<string | null>(null);
  const [vistoriaForm, setVistoriaForm] = useState({ ...VISTORIA_VAZIA });

  const [showFotoForm, setShowFotoForm] = useState(false);
  const [fotoForm, setFotoForm] = useState({ etapa: "", observacao: "", data: hoje() });
  const [fotoArquivo, setFotoArquivo] = useState<File | null>(null);

  const [showMedicaoForm, setShowMedicaoForm] = useState(false);
  const [medicaoEdit, setMedicaoEdit] = useState<string | null>(null);
  const [medicaoForm, setMedicaoForm] = useState({ ...MEDICAO_VAZIA });

  const carregarObras = useCallback(async () => {
    setLoading(true);
    try {
      const [o, m] = await Promise.all([api.listObras(convenioId), api.listMedicoes(convenioId)]);
      setObras(o);
      setMedicoes(m);
      setObraId((prev) => (prev && o.some((x) => x.id === prev) ? prev : o[0]?.id || ""));
    } catch (e: any) {
      notify.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [convenioId]);

  useEffect(() => {
    carregarObras();
  }, [carregarObras]);

  const carregarObra = useCallback(async () => {
    if (!obraId) {
      setDiario([]);
      setVistorias([]);
      setFotos([]);
      return;
    }
    const [d, v, f] = await Promise.all([
      api.listDiario(convenioId, obraId).catch(() => [] as DiarioObra[]),
      api.listVistorias(convenioId, obraId).catch(() => [] as VistoriaObra[]),
      api.listFotos(convenioId, obraId).catch(() => [] as RegistroFoto[]),
    ]);
    setDiario(d);
    setVistorias(v);
    setFotos(f);
  }, [convenioId, obraId]);

  useEffect(() => {
    carregarObra();
  }, [carregarObra]);

  const recarregar = async () => {
    await Promise.all([carregarObras(), carregarObra()]);
  };

  const subTabs: { key: SubTab; label: string; count: number; icon: React.ReactNode; desc: string; acao: string }[] = [
    {
      key: "diario",
      label: "Diário de Obra",
      count: diario.length,
      icon: <NotebookPen className="w-4 h-4" />,
      desc: "Registros diários do canteiro: atividades, equipe, condições e ocorrências.",
      acao: "Novo registro",
    },
    {
      key: "vistorias",
      label: "Vistorias",
      count: vistorias.length,
      icon: <ClipboardCheck className="w-4 h-4" />,
      desc: "Vistorias e inspeções da obra (rotineiras, recebimento, fiscalização).",
      acao: "Nova vistoria",
    },
    {
      key: "fotos",
      label: "Fotos",
      count: fotos.length,
      icon: <Camera className="w-4 h-4" />,
      desc: "Galeria fotográfica da obra — registros visuais por etapa.",
      acao: "Nova foto",
    },
    {
      key: "medicoes",
      label: "Medições",
      count: medicoes.length,
      icon: <Ruler className="w-4 h-4" />,
      desc: "Medições e pagamentos da obra.",
      acao: "Nova medição",
    },
  ];

  const subAtiva = subTabs.find((s) => s.key === activeSub)!;

  const valorAcumulado = useMemo(
    () => medicoes.reduce((acc, m) => acc + Number(m.valor || 0), 0),
    [medicoes]
  );
  const percentualAcumulado = useMemo(() => {
    if (medicoes.length === 0) return 0;
    return Math.max(...medicoes.map((m) => Number(m.percentual_acumulado || 0)));
  }, [medicoes]);

  const inputCls =
    "w-full rounded-lg border border-[#E4E7EC] bg-white px-3.5 py-2.5 text-[14px] text-[#101828] placeholder:text-[#98A2B3] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8]";
  const labelCls = "block text-[13px] text-[#475467] mb-1.5";

  // ── Ações ───────────────────────────────────────────────

  const criarObra = async () => {
    try {
      await api.criarObra(convenioId, {
        nome: obraForm.nome || undefined,
        endereco: obraForm.endereco || undefined,
        empresa: obraForm.empresa || undefined,
        contrato_numero: obraForm.contrato_numero || undefined,
        situacao: "EM_ANDAMENTO",
      });
      notify.success("Obra cadastrada!");
      setObraForm({ nome: "", endereco: "", empresa: "", contrato_numero: "" });
      setShowObraForm(false);
      carregarObras();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const salvarDiario = async () => {
    if (!obraId) return notify.error("Cadastre a obra antes de registrar o diário");
    const payload = {
      tipo: "AVANCO",
      data: diarioForm.data ? new Date(`${diarioForm.data}T12:00:00`).toISOString() : undefined,
      clima: diarioForm.clima || undefined,
      temperatura: diarioForm.temperatura || undefined,
      efetivo: diarioForm.efetivo ? Number(diarioForm.efetivo) : undefined,
      equipe: diarioForm.equipe || undefined,
      atividades: diarioForm.atividades || undefined,
      equipamentos: diarioForm.equipamentos || undefined,
      ocorrencias: diarioForm.ocorrencias || undefined,
      impedimentos: diarioForm.impedimentos || undefined,
      titulo: (diarioForm.atividades || "Registro do canteiro").slice(0, 300),
    };
    try {
      if (diarioEdit) await api.atualizarDiario(convenioId, obraId, diarioEdit, payload);
      else await api.registrarDiario(convenioId, obraId, payload);
      notify.success(diarioEdit ? "Registro atualizado!" : "Registro salvo!");
      setDiarioForm({ ...DIARIO_VAZIO });
      setDiarioEdit(null);
      setShowDiarioForm(false);
      carregarObra();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const editarDiario = (d: DiarioObra) => {
    setDiarioEdit(d.id);
    setDiarioForm({
      data: d.data ? d.data.slice(0, 10) : hoje(),
      clima: d.clima || "Ensolarado",
      efetivo: d.efetivo != null ? String(d.efetivo) : "0",
      temperatura: d.temperatura || "",
      equipe: d.equipe || "",
      atividades: d.atividades || d.descricao || "",
      equipamentos: d.equipamentos || "",
      ocorrencias: d.ocorrencias || "",
      impedimentos: d.impedimentos || "",
    });
    setShowDiarioForm(true);
  };

  const excluirDiario = async (d: DiarioObra) => {
    if (!window.confirm("Excluir este registro do diário?")) return;
    try {
      await api.excluirDiario(convenioId, obraId, d.id);
      notify.success("Registro excluído!");
      carregarObra();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const salvarVistoria = async () => {
    if (!obraId) return notify.error("Cadastre a obra antes de registrar vistorias");
    const payload = {
      data: vistoriaForm.data ? new Date(`${vistoriaForm.data}T12:00:00`).toISOString() : undefined,
      tipo: vistoriaForm.tipo,
      vistoriador: vistoriaForm.vistoriador || undefined,
      orgao_vistoriador: vistoriaForm.orgao_vistoriador || undefined,
      status: vistoriaForm.status,
      protocolo: vistoriaForm.protocolo || undefined,
      observacoes: vistoriaForm.observacoes || undefined,
      nao_conformidades: vistoriaForm.nao_conformidades || undefined,
      recomendacoes: vistoriaForm.recomendacoes || undefined,
    };
    try {
      if (vistoriaEdit) await api.atualizarVistoria(convenioId, obraId, vistoriaEdit, payload);
      else await api.registrarVistoria(convenioId, obraId, payload);
      notify.success(vistoriaEdit ? "Vistoria atualizada!" : "Vistoria registrada!");
      setVistoriaForm({ ...VISTORIA_VAZIA });
      setVistoriaEdit(null);
      setShowVistoriaForm(false);
      carregarObra();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const editarVistoria = (v: VistoriaObra) => {
    setVistoriaEdit(v.id);
    setVistoriaForm({
      data: v.data ? v.data.slice(0, 10) : hoje(),
      tipo: v.tipo || "ROTINEIRA",
      vistoriador: v.vistoriador || "",
      orgao_vistoriador: v.orgao_vistoriador || "",
      status: v.status || "AGENDADA",
      protocolo: v.protocolo || "",
      observacoes: v.observacoes || "",
      nao_conformidades: v.nao_conformidades || "",
      recomendacoes: v.recomendacoes || "",
    });
    setShowVistoriaForm(true);
  };

  const excluirVistoria = async (v: VistoriaObra) => {
    if (!window.confirm("Excluir esta vistoria?")) return;
    try {
      await api.excluirVistoria(convenioId, obraId, v.id);
      notify.success("Vistoria excluída!");
      carregarObra();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const salvarFoto = async () => {
    if (!obraId) return notify.error("Cadastre a obra antes de registrar fotos");
    try {
      const foto: any = await api.registrarFoto(convenioId, obraId, {
        etapa: fotoForm.etapa || undefined,
        observacao: fotoForm.observacao || undefined,
        data: fotoForm.data ? new Date(`${fotoForm.data}T12:00:00`).toISOString() : undefined,
      });
      if (fotoArquivo && foto?.id) {
        const anexo: any = await api.uploadAnexoAvancado(convenioId, fotoArquivo, {
          tipo_documento: "FOTO",
          categoria: "FOTOS",
          classificacao: "INTERNO",
          descricao: fotoForm.observacao || undefined,
        });
        if (anexo?.id) await api.anexarFoto(convenioId, obraId, foto.id, anexo.id);
      }
      notify.success("Foto registrada!");
      setFotoForm({ etapa: "", observacao: "", data: hoje() });
      setFotoArquivo(null);
      setShowFotoForm(false);
      carregarObra();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const salvarMedicao = async () => {
    const payload = {
      numero: medicaoForm.numero ? Number(medicaoForm.numero.replace("#", "")) : undefined,
      data: medicaoForm.data || undefined,
      observacao: medicaoForm.periodo || undefined,
      valor: medicaoForm.valor ? Number(medicaoForm.valor) : undefined,
      percentual: medicaoForm.percentual ? Number(medicaoForm.percentual) : undefined,
      percentual_acumulado: medicaoForm.percentual_acumulado
        ? Number(medicaoForm.percentual_acumulado)
        : undefined,
      status: medicaoForm.status,
    };
    try {
      if (medicaoEdit) await api.atualizarMedicao(convenioId, medicaoEdit, payload);
      else await api.criarMedicao(convenioId, payload);
      notify.success(medicaoEdit ? "Medição atualizada!" : "Medição registrada!");
      setMedicaoForm({ ...MEDICAO_VAZIA });
      setMedicaoEdit(null);
      setShowMedicaoForm(false);
      carregarObras();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const editarMedicao = (m: Medicao) => {
    setMedicaoEdit(m.id);
    setMedicaoForm({
      numero: String(m.numero ?? ""),
      data: m.data ? m.data.slice(0, 10) : hoje(),
      periodo: m.observacao || "",
      valor: m.valor != null ? String(m.valor) : "",
      percentual: m.percentual != null ? String(m.percentual) : "",
      percentual_acumulado: m.percentual_acumulado != null ? String(m.percentual_acumulado) : "",
      status: m.status || "REGISTRADA",
    });
    setShowMedicaoForm(true);
  };

  const excluirMedicao = async (m: Medicao) => {
    if (!window.confirm("Excluir esta medição?")) return;
    try {
      await api.excluirMedicao(convenioId, m.id);
      notify.success("Medição excluída!");
      carregarObras();
    } catch (e: any) {
      notify.error(e.message);
    }
  };

  const abrirForm = () => {
    if (activeSub === "diario") {
      setDiarioEdit(null);
      setDiarioForm({ ...DIARIO_VAZIO });
      setShowDiarioForm((v) => !v);
    } else if (activeSub === "vistorias") {
      setVistoriaEdit(null);
      setVistoriaForm({ ...VISTORIA_VAZIA });
      setShowVistoriaForm((v) => !v);
    } else if (activeSub === "fotos") {
      setShowFotoForm((v) => !v);
    } else {
      setMedicaoEdit(null);
      setMedicaoForm({ ...MEDICAO_VAZIA });
      setShowMedicaoForm((v) => !v);
    }
  };

  if (loading) {
    return <div className="skeleton h-72 rounded-xl" />;
  }

  return (
    <div className="space-y-5">
      {/* Sub-abas */}
      <div className="flex items-center border-b border-[#E4E7EC] overflow-x-auto scrollbar-thin">
        {subTabs.map((st) => (
          <button
            key={st.key}
            onClick={() => setActiveSub(st.key)}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-[14px] font-medium border-b-2 -mb-px whitespace-nowrap transition-colors",
              activeSub === st.key
                ? "border-[#1D4ED8] text-[#1D4ED8]"
                : "border-transparent text-[#667085] hover:text-[#101828]"
            )}
          >
            {st.icon}
            {st.label}
            <span className="text-[12px] text-[#98A2B3] tabular-nums">{st.count}</span>
          </button>
        ))}
      </div>

      {obras.length === 0 ? (
        <div className="bg-white border border-[#E4E7EC] rounded-xl p-10 text-center">
          <p className="text-[14px] text-[#475467]">Nenhuma obra cadastrada neste processo.</p>
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowObraForm((v) => !v)}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1D4ED8] text-white px-4 py-2.5 text-[13px] font-semibold hover:bg-[#1E40AF] transition-colors mt-4"
            >
              <Plus className="w-4 h-4" /> Cadastrar obra
            </button>
          )}
          {showObraForm && canEdit && (
            <div className="mt-5 text-left grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Nome da obra</label>
                <input
                  value={obraForm.nome}
                  onChange={(e) => setObraForm({ ...obraForm, nome: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Endereço</label>
                <input
                  value={obraForm.endereco}
                  onChange={(e) => setObraForm({ ...obraForm, endereco: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Empresa executora</label>
                <input
                  value={obraForm.empresa}
                  onChange={(e) => setObraForm({ ...obraForm, empresa: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Nº do contrato</label>
                <input
                  value={obraForm.contrato_numero}
                  onChange={(e) => setObraForm({ ...obraForm, contrato_numero: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div className="sm:col-span-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowObraForm(false)}
                  className="px-4 py-2.5 text-[13px] font-medium text-[#475467] hover:text-[#101828] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={criarObra}
                  className="rounded-lg bg-[#1D4ED8] text-white px-4 py-2.5 text-[13px] font-semibold hover:bg-[#1E40AF] transition-colors"
                >
                  Salvar obra
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Medições exibem os indicadores acima da descrição */}
          {activeSub === "medicoes" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Kpi label="Medições" valor={String(medicoes.length)} />
              <Kpi label="Valor acumulado" valor={formatCurrency(valorAcumulado)} />
              <Kpi label="% executado acumulado" valor={`${pctLabel(percentualAcumulado)}%`} />
            </div>
          )}

          <div className="flex items-center justify-between gap-4">
            <p className="text-[13px] text-[#667085]">{subAtiva.desc}</p>
            <div className="flex items-center gap-3 shrink-0">
              {obras.length > 1 && activeSub !== "medicoes" && (
                <select
                  value={obraId}
                  onChange={(e) => setObraId(e.target.value)}
                  className="rounded-lg border border-[#E4E7EC] bg-white px-3 py-2 text-[13px] text-[#344054] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20"
                >
                  {obras.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nome || "Obra"}
                    </option>
                  ))}
                </select>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={abrirForm}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#1D4ED8] text-white px-4 py-2.5 text-[13px] font-semibold hover:bg-[#1E40AF] transition-colors"
                >
                  <Plus className="w-4 h-4" /> {subAtiva.acao}
                </button>
              )}
            </div>
          </div>

          {/* ── Diário de obra ─────────────────────────────── */}
          {activeSub === "diario" && (
            <div className="space-y-4">
              {showDiarioForm && canEdit && (
                <div className="bg-white border border-[#E4E7EC] rounded-xl p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Data *</label>
                      <input
                        type="date"
                        value={diarioForm.data}
                        onChange={(e) => setDiarioForm({ ...diarioForm, data: e.target.value })}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Clima</label>
                      <select
                        value={diarioForm.clima}
                        onChange={(e) => setDiarioForm({ ...diarioForm, clima: e.target.value })}
                        className={inputCls}
                      >
                        {CLIMAS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Efetivo (trabalhadores)</label>
                      <input
                        type="number"
                        min={0}
                        value={diarioForm.efetivo}
                        onChange={(e) => setDiarioForm({ ...diarioForm, efetivo: e.target.value })}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Temperatura</label>
                      <input
                        value={diarioForm.temperatura}
                        onChange={(e) => setDiarioForm({ ...diarioForm, temperatura: e.target.value })}
                        placeholder="Ex: 28°C"
                        className={inputCls}
                      />
                    </div>
                  </div>
                  <div className="space-y-4 mt-4">
                    <Campo label="Equipe" value={diarioForm.equipe} onChange={(v) => setDiarioForm({ ...diarioForm, equipe: v })} rows={2} />
                    <Campo label="Atividades executadas" value={diarioForm.atividades} onChange={(v) => setDiarioForm({ ...diarioForm, atividades: v })} rows={3} />
                    <Campo label="Equipamentos" value={diarioForm.equipamentos} onChange={(v) => setDiarioForm({ ...diarioForm, equipamentos: v })} rows={2} />
                    <Campo label="Ocorrências" value={diarioForm.ocorrencias} onChange={(v) => setDiarioForm({ ...diarioForm, ocorrencias: v })} rows={2} />
                    <Campo label="Impedimentos / paralisações" value={diarioForm.impedimentos} onChange={(v) => setDiarioForm({ ...diarioForm, impedimentos: v })} rows={2} />
                  </div>
                  <div className="flex items-center justify-end gap-3 mt-5">
                    <button
                      type="button"
                      onClick={() => {
                        setShowDiarioForm(false);
                        setDiarioEdit(null);
                      }}
                      className="px-4 py-2.5 text-[13px] font-medium text-[#475467] hover:text-[#101828] transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={salvarDiario}
                      className="rounded-lg bg-[#1D4ED8] text-white px-4 py-2.5 text-[13px] font-semibold hover:bg-[#1E40AF] transition-colors"
                    >
                      Salvar registro
                    </button>
                  </div>
                </div>
              )}

              {diario.length === 0 ? (
                <p className="text-[13px] text-[#98A2B3] text-center py-10">Nenhum registro no diário desta obra.</p>
              ) : (
                diario.map((d) => (
                  <div key={d.id} className="bg-white border border-[#E4E7EC] rounded-xl p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-[14px] font-semibold text-[#101828] tabular-nums">
                          {formatDate(d.data || d.created_at)}
                        </span>
                        {d.clima && (
                          <span className="inline-flex items-center gap-1.5 rounded-pill bg-[#F2F4F7] px-2.5 py-1 text-[12px] text-[#475467]">
                            <Cloud className="w-3.5 h-3.5" /> {d.clima}
                          </span>
                        )}
                        {d.efetivo != null && (
                          <span className="inline-flex items-center gap-1.5 text-[12px] text-[#667085]">
                            <Users className="w-3.5 h-3.5" /> {d.efetivo}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {d.temperatura && <span className="text-[12px] text-[#98A2B3] mr-1">{d.temperatura}</span>}
                        {canEdit && (
                          <>
                            <IconBtn title="Editar registro" onClick={() => editarDiario(d)} icon={Pencil} />
                            <IconBtn title="Excluir registro" onClick={() => excluirDiario(d)} icon={Trash2} perigo />
                          </>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3 mt-4">
                      <Secao titulo="Atividades" texto={d.atividades || d.descricao} />
                      <Secao titulo="Equipe" texto={d.equipe} />
                      <Secao titulo="Equipamentos" texto={d.equipamentos} />
                      <Secao titulo="Ocorrências" texto={d.ocorrencias} />
                      <Secao titulo="Impedimentos" texto={d.impedimentos} />
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Vistorias ──────────────────────────────────── */}
          {activeSub === "vistorias" && (
            <div className="space-y-4">
              {showVistoriaForm && canEdit && (
                <div className="bg-white border border-[#E4E7EC] rounded-xl p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Data *</label>
                      <input
                        type="date"
                        value={vistoriaForm.data}
                        onChange={(e) => setVistoriaForm({ ...vistoriaForm, data: e.target.value })}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Tipo *</label>
                      <select
                        value={vistoriaForm.tipo}
                        onChange={(e) => setVistoriaForm({ ...vistoriaForm, tipo: e.target.value })}
                        className={inputCls}
                      >
                        {Object.entries(VISTORIA_TIPOS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Vistoriador</label>
                      <input
                        value={vistoriaForm.vistoriador}
                        onChange={(e) => setVistoriaForm({ ...vistoriaForm, vistoriador: e.target.value })}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Órgão vistoriador</label>
                      <input
                        value={vistoriaForm.orgao_vistoriador}
                        onChange={(e) => setVistoriaForm({ ...vistoriaForm, orgao_vistoriador: e.target.value })}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Status</label>
                      <select
                        value={vistoriaForm.status}
                        onChange={(e) => setVistoriaForm({ ...vistoriaForm, status: e.target.value })}
                        className={inputCls}
                      >
                        {Object.entries(VISTORIA_STATUS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Protocolo</label>
                      <input
                        value={vistoriaForm.protocolo}
                        onChange={(e) => setVistoriaForm({ ...vistoriaForm, protocolo: e.target.value })}
                        className={inputCls}
                      />
                    </div>
                  </div>
                  <div className="space-y-4 mt-4">
                    <Campo label="Observações" value={vistoriaForm.observacoes} onChange={(v) => setVistoriaForm({ ...vistoriaForm, observacoes: v })} rows={2} />
                    <Campo label="Não conformidades" value={vistoriaForm.nao_conformidades} onChange={(v) => setVistoriaForm({ ...vistoriaForm, nao_conformidades: v })} rows={2} />
                    <Campo label="Recomendações" value={vistoriaForm.recomendacoes} onChange={(v) => setVistoriaForm({ ...vistoriaForm, recomendacoes: v })} rows={2} />
                  </div>
                  <div className="flex items-center justify-end gap-3 mt-5">
                    <button
                      type="button"
                      onClick={() => {
                        setShowVistoriaForm(false);
                        setVistoriaEdit(null);
                      }}
                      className="px-4 py-2.5 text-[13px] font-medium text-[#475467] hover:text-[#101828] transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={salvarVistoria}
                      className="rounded-lg bg-[#1D4ED8] text-white px-4 py-2.5 text-[13px] font-semibold hover:bg-[#1E40AF] transition-colors"
                    >
                      Salvar vistoria
                    </button>
                  </div>
                </div>
              )}

              {vistorias.length === 0 ? (
                <p className="text-[13px] text-[#98A2B3] text-center py-10">Nenhuma vistoria registrada nesta obra.</p>
              ) : (
                vistorias.map((v) => (
                  <div key={v.id} className="bg-white border border-[#E4E7EC] rounded-xl p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-[14px]">
                          <span className="font-semibold text-[#101828]">
                            {VISTORIA_TIPOS[v.tipo || "ROTINEIRA"] || v.tipo}
                          </span>{" "}
                          <span className="text-[#667085] tabular-nums">{formatDate(v.data || v.created_at)}</span>
                        </p>
                        {(v.vistoriador || v.orgao_vistoriador) && (
                          <p className="text-[13px] text-[#667085] mt-1">
                            {[v.vistoriador, v.orgao_vistoriador].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {v.status && (
                          <span
                            className={cn(
                              "inline-flex items-center rounded-pill px-2.5 py-1 text-[12px] font-medium",
                              RECURSOS_STATUS_COLORS[v.status] || "bg-[#F2F4F7] text-[#475467]"
                            )}
                          >
                            {VISTORIA_STATUS[v.status] || v.status}
                          </span>
                        )}
                        {canEdit && (
                          <>
                            <IconBtn title="Editar vistoria" onClick={() => editarVistoria(v)} icon={Pencil} />
                            <IconBtn title="Excluir vistoria" onClick={() => excluirVistoria(v)} icon={Trash2} perigo />
                          </>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3 mt-4">
                      <Secao titulo="Observações" texto={v.observacoes} />
                      <Secao titulo="Não conformidades" texto={v.nao_conformidades} />
                      <Secao titulo="Recomendações" texto={v.recomendacoes} />
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Fotos ──────────────────────────────────────── */}
          {activeSub === "fotos" && (
            <div className="space-y-4">
              {showFotoForm && canEdit && (
                <div className="bg-white border border-[#E4E7EC] rounded-xl p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Data</label>
                      <input
                        type="date"
                        value={fotoForm.data}
                        onChange={(e) => setFotoForm({ ...fotoForm, data: e.target.value })}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Etapa</label>
                      <input
                        value={fotoForm.etapa}
                        onChange={(e) => setFotoForm({ ...fotoForm, etapa: e.target.value })}
                        placeholder="Ex: Estrutura"
                        className={inputCls}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Legenda</label>
                      <input
                        value={fotoForm.observacao}
                        onChange={(e) => setFotoForm({ ...fotoForm, observacao: e.target.value })}
                        placeholder="Ex: Concretagem do pilar P12"
                        className={inputCls}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelCls}>Imagem</label>
                      <label className="flex items-center gap-2 rounded-lg border border-dashed border-[#D0D5DD] bg-white px-3.5 py-3 text-[14px] text-[#667085] cursor-pointer hover:border-[#1D4ED8] hover:text-[#1D4ED8] transition-colors">
                        <ImageIcon className="w-4 h-4" />
                        {fotoArquivo ? fotoArquivo.name : "Selecionar imagem"}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => setFotoArquivo(e.target.files?.[0] || null)}
                        />
                      </label>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-3 mt-5">
                    <button
                      type="button"
                      onClick={() => setShowFotoForm(false)}
                      className="px-4 py-2.5 text-[13px] font-medium text-[#475467] hover:text-[#101828] transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={salvarFoto}
                      className="rounded-lg bg-[#1D4ED8] text-white px-4 py-2.5 text-[13px] font-semibold hover:bg-[#1E40AF] transition-colors"
                    >
                      Salvar foto
                    </button>
                  </div>
                </div>
              )}

              {fotos.length === 0 ? (
                <p className="text-[13px] text-[#98A2B3] text-center py-10">Nenhuma foto registrada nesta obra.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {fotos.map((f) => (
                    <div key={f.id} className="bg-white border border-[#E4E7EC] rounded-xl overflow-hidden">
                      <div className="aspect-[4/3] bg-[#F2F4F7] flex items-center justify-center">
                        {f.anexo_id ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/govtask/anexos/${f.anexo_id}/download`}
                            alt={f.observacao || "Registro fotográfico"}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <ImageIcon className="w-10 h-10 text-[#D0D5DD]" />
                        )}
                      </div>
                      <div className="p-4">
                        {f.etapa && (
                          <span className="inline-flex items-center rounded-pill bg-[#EFF8FF] px-2.5 py-1 text-[12px] font-medium text-[#175CD3]">
                            {f.etapa}
                          </span>
                        )}
                        {f.observacao && (
                          <p className="text-[14px] text-[#101828] mt-2">{f.observacao}</p>
                        )}
                        <p className="text-[12px] text-[#98A2B3] mt-1 tabular-nums">
                          {formatDate(f.data || f.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Medições ───────────────────────────────────── */}
          {activeSub === "medicoes" && (
            <div className="space-y-4">
              {showMedicaoForm && canEdit && (
                <div className="bg-white border border-[#E4E7EC] rounded-xl p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Nº</label>
                      <input
                        value={medicaoForm.numero}
                        onChange={(e) => setMedicaoForm({ ...medicaoForm, numero: e.target.value })}
                        placeholder={`#${medicoes.length + 1}`}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Data</label>
                      <input
                        type="date"
                        value={medicaoForm.data}
                        onChange={(e) => setMedicaoForm({ ...medicaoForm, data: e.target.value })}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Período</label>
                      <input
                        value={medicaoForm.periodo}
                        onChange={(e) => setMedicaoForm({ ...medicaoForm, periodo: e.target.value })}
                        placeholder="Ex: 01/03 a 31/03"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Valor (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={medicaoForm.valor}
                        onChange={(e) => setMedicaoForm({ ...medicaoForm, valor: e.target.value })}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>% executado</label>
                      <input
                        type="number"
                        step="0.01"
                        value={medicaoForm.percentual}
                        onChange={(e) => setMedicaoForm({ ...medicaoForm, percentual: e.target.value })}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>% acumulado</label>
                      <input
                        type="number"
                        step="0.01"
                        value={medicaoForm.percentual_acumulado}
                        onChange={(e) =>
                          setMedicaoForm({ ...medicaoForm, percentual_acumulado: e.target.value })
                        }
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Status</label>
                      <select
                        value={medicaoForm.status}
                        onChange={(e) => setMedicaoForm({ ...medicaoForm, status: e.target.value })}
                        className={inputCls}
                      >
                        {Object.entries(STATUS_MEDICAO_LABELS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-3 mt-5">
                    <button
                      type="button"
                      onClick={() => {
                        setShowMedicaoForm(false);
                        setMedicaoEdit(null);
                      }}
                      className="px-4 py-2.5 text-[13px] font-medium text-[#475467] hover:text-[#101828] transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={salvarMedicao}
                      className="rounded-lg bg-[#1D4ED8] text-white px-4 py-2.5 text-[13px] font-semibold hover:bg-[#1E40AF] transition-colors"
                    >
                      Salvar medição
                    </button>
                  </div>
                </div>
              )}

              {medicoes.length === 0 ? (
                <p className="text-[13px] text-[#98A2B3] text-center py-10">Nenhuma medição registrada.</p>
              ) : (
                <div className="bg-white border border-[#E4E7EC] rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="bg-[#F9FAFB] text-[12px] text-[#667085] text-left">
                          <th className="py-3 px-4 font-medium">Nº</th>
                          <th className="py-3 px-4 font-medium">Data</th>
                          <th className="py-3 px-4 font-medium">Período</th>
                          <th className="py-3 px-4 font-medium text-right">Valor</th>
                          <th className="py-3 px-4 font-medium">% acumulado</th>
                          <th className="py-3 px-4 font-medium">Status</th>
                          {canEdit && <th className="py-3 px-4" />}
                        </tr>
                      </thead>
                      <tbody>
                        {medicoes.map((m) => (
                          <tr key={m.id} className="border-t border-[#F2F4F7]">
                            <td className="py-3 px-4 font-semibold text-[#101828] tabular-nums">#{m.numero}</td>
                            <td className="py-3 px-4 text-[#475467] tabular-nums whitespace-nowrap">
                              {formatDate(m.data || m.created_at)}
                            </td>
                            <td className="py-3 px-4 text-[#475467]">{m.observacao || "—"}</td>
                            <td className="py-3 px-4 text-right tabular-nums font-medium text-[#101828]">
                              {formatCurrency(m.valor)}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2 min-w-[110px]">
                                <div className="h-1.5 flex-1 bg-[#F2F4F7] rounded-pill overflow-hidden">
                                  <div
                                    className="h-full bg-[#2E90FA]"
                                    style={{ width: `${pct(m.percentual_acumulado)}%` }}
                                  />
                                </div>
                                <span className="text-[12px] text-[#667085] tabular-nums w-9 text-right">
                                  {pctLabel(m.percentual_acumulado)}%
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-pill px-2.5 py-1 text-[12px] font-medium",
                                  RECURSOS_STATUS_COLORS[m.status] || "bg-[#EFF8FF] text-[#175CD3]"
                                )}
                              >
                                {STATUS_MEDICAO_LABELS[m.status] || m.status}
                              </span>
                            </td>
                            {canEdit && (
                              <td className="py-3 px-4">
                                <div className="flex items-center justify-end gap-1">
                                  <IconBtn title="Editar medição" onClick={() => editarMedicao(m)} icon={Pencil} />
                                  <IconBtn title="Excluir medição" onClick={() => excluirMedicao(m)} icon={Trash2} perigo />
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="bg-white border border-[#E4E7EC] rounded-xl p-4">
      <p className="text-[12px] text-[#98A2B3]">{label}</p>
      <p className="text-[18px] font-bold text-[#101828] tabular-nums mt-1">{valor}</p>
    </div>
  );
}

function Secao({ titulo, texto }: { titulo: string; texto?: string | null }) {
  if (!texto) return null;
  return (
    <div>
      <p className="text-[12px] text-[#98A2B3]">{titulo}</p>
      <p className="text-[14px] text-[#101828] mt-0.5 whitespace-pre-line">{texto}</p>
    </div>
  );
}

function Campo({
  label,
  value,
  onChange,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows: number;
}) {
  return (
    <div>
      <label className="block text-[13px] text-[#475467] mb-1.5">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full rounded-lg border border-[#E4E7EC] bg-white px-3.5 py-2.5 text-[14px] text-[#101828] placeholder:text-[#98A2B3] focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8] resize-y"
      />
    </div>
  );
}

function IconBtn({
  title,
  onClick,
  icon: Icon,
  perigo,
}: {
  title: string;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  perigo?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        "p-1.5 rounded-lg text-[#98A2B3] transition-colors",
        perigo ? "hover:text-[#B42318] hover:bg-[#B42318]/5" : "hover:text-[#1D4ED8] hover:bg-[#1D4ED8]/5"
      )}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}
