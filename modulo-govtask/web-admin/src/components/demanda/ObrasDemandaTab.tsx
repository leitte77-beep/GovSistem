"use client";

/**
 * Obra como faceta da demanda (§54–§58).
 *
 * A mesma obra que nasce sob um convênio pode nascer sob a demanda. Aqui a
 * demanda é o pai: cronograma, diário, fotos e vistorias entram pelo caminho
 * `/demandas/{id}/obras`, autorizado pela demanda (tenant + sigilo) antes de
 * qualquer id de obra ser tocado.
 *
 * Medições continuam no caminho do convênio (§58): a API ainda não as monta sob
 * a demanda, e inventar uma tabela paralela duplicaria o acompanhamento.
 */

import { useCallback, useEffect, useState } from "react";
import { Camera, ClipboardCheck, HardHat, NotebookPen, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { notify } from "@/components/ui/Toast";
import { cn, formatCurrency, formatDate, pct, pctLabel } from "@/lib/utils";
import type { DiarioObra, Medicao, Obra, RegistroFoto, VistoriaObra } from "@/types/govtask";
import { VISTORIA_TIPOS, VISTORIA_STATUS } from "@/types/govtask";

type Props = { demandaId: string; podeEditar: boolean };
type SubAba = "cronograma" | "diario" | "fotos" | "vistorias" | "medicoes";

const hoje = () => new Date().toISOString().slice(0, 10);
const CLIMAS = ["Ensolarado", "Nublado", "Chuvoso", "Parcialmente nublado", "Ventania"];

type MedicaoForm = { numero: string; data: string; valor: string; percentual: string; percentual_acumulado: string; observacao: string };

const OBRA_VAZIA = { nome: "", endereco: "", empresa: "", contrato_numero: "", valor_contrato: "" };
const DIARIO_VAZIO = { data: hoje(), clima: "Ensolarado", efetivo: "", equipe: "", atividades: "", ocorrencias: "", impedimentos: "" };
const VISTORIA_VAZIA = { data: hoje(), tipo: "ROTINEIRA", vistoriador: "", orgao_vistoriador: "", status: "AGENDADA", observacoes: "", nao_conformidades: "", recomendacoes: "" };

export function ObrasDemandaTab({ demandaId, podeEditar }: Props) {
  const [obras, setObras] = useState<Obra[]>([]);
  const [obraId, setObraId] = useState("");
  const [sub, setSub] = useState<SubAba>("cronograma");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [diario, setDiario] = useState<DiarioObra[]>([]);
  const [fotos, setFotos] = useState<RegistroFoto[]>([]);
  const [vistorias, setVistorias] = useState<VistoriaObra[]>([]);
  // A medição pende da demanda, não de uma obra específica (§58).
  const [medicoes, setMedicoes] = useState<Medicao[]>([]);
  const [medicaoForm, setMedicaoForm] = useState({ numero: "", data: hoje(), valor: "", percentual: "", percentual_acumulado: "", observacao: "" });

  const [obraForm, setObraForm] = useState({ ...OBRA_VAZIA });
  const [mostrarObraForm, setMostrarObraForm] = useState(false);
  const [cronogramaForm, setCronogramaForm] = useState({ descricao: "", valor: "", percentual_previsto: "" });
  const [diarioForm, setDiarioForm] = useState({ ...DIARIO_VAZIO });
  const [vistoriaForm, setVistoriaForm] = useState({ ...VISTORIA_VAZIA });
  const [fotoForm, setFotoForm] = useState({ observacao: "", etapa: "" });
  const [fotoArquivo, setFotoArquivo] = useState<File | null>(null);

  const obra = obras.find((o) => o.id === obraId);

  const carregarObras = useCallback(async () => {
    setCarregando(true);
    try {
      const lista = await api.listarObrasDemanda(demandaId);
      setObras(lista);
      setObraId((atual) => (lista.some((o) => o.id === atual) ? atual : lista[0]?.id ?? ""));
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível carregar as obras");
    } finally {
      setCarregando(false);
    }
  }, [demandaId]);

  const carregarFilhos = useCallback(async (id: string) => {
    const [d, f, v] = await Promise.all([
      api.listarDiarioDemanda(demandaId, id).catch(() => [] as DiarioObra[]),
      api.listarFotosDemanda(demandaId, id).catch(() => [] as RegistroFoto[]),
      api.listarVistoriasDemanda(demandaId, id).catch(() => [] as VistoriaObra[]),
    ]);
    setDiario(d);
    setFotos(f);
    setVistorias(v);
  }, [demandaId]);

  const carregarMedicoes = useCallback(async () => {
    try {
      setMedicoes(await api.listarMedicoesDemanda(demandaId));
    } catch {
      setMedicoes([]);
    }
  }, [demandaId]);

  useEffect(() => { carregarObras(); }, [carregarObras]);
  useEffect(() => { carregarMedicoes(); }, [carregarMedicoes]);
  useEffect(() => { if (obraId) carregarFilhos(obraId); }, [obraId, carregarFilhos]);

  const registrarMedicao = async () => {
    if (!medicaoForm.numero || Number(medicaoForm.numero) < 1) return notify.error("Informe o número da medição");
    try {
      await api.criarMedicaoDemanda(demandaId, {
        numero: Number(medicaoForm.numero),
        data: medicaoForm.data || null,
        valor: medicaoForm.valor ? Number(medicaoForm.valor) : null,
        percentual: medicaoForm.percentual ? Number(medicaoForm.percentual) : null,
        percentual_acumulado: medicaoForm.percentual_acumulado ? Number(medicaoForm.percentual_acumulado) : null,
        observacao: medicaoForm.observacao || null,
      });
      setMedicaoForm({ numero: "", data: hoje(), valor: "", percentual: "", percentual_acumulado: "", observacao: "" });
      await carregarMedicoes();
      notify.success("Medição registrada");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível registrar a medição");
    }
  };

  const aprovarMedicao = async (id: string) => {
    try { await api.aprovarMedicaoDemanda(demandaId, id); await carregarMedicoes(); }
    catch (e) { notify.error(e instanceof Error ? e.message : "Não foi possível aprovar a medição"); }
  };

  const excluirMedicao = async (id: string) => {
    if (!window.confirm("Remover esta medição?")) return;
    try { await api.excluirMedicaoDemanda(demandaId, id); await carregarMedicoes(); }
    catch (e) { notify.error(e instanceof Error ? e.message : "Não foi possível remover a medição"); }
  };

  const criarObra = async () => {
    if (obraForm.nome.trim().length < 3 && obraForm.endereco.trim().length < 3) {
      return notify.error("Informe ao menos o nome ou o endereço da obra");
    }
    setSalvando(true);
    try {
      const nova = await api.criarObraDemanda(demandaId, {
        nome: obraForm.nome.trim() || null,
        endereco: obraForm.endereco.trim() || null,
        empresa: obraForm.empresa.trim() || null,
        contrato_numero: obraForm.contrato_numero.trim() || null,
        valor_contrato: obraForm.valor_contrato ? Number(obraForm.valor_contrato) : null,
      });
      setObraForm({ ...OBRA_VAZIA });
      setMostrarObraForm(false);
      await carregarObras();
      setObraId(nova.id);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível cadastrar a obra");
    } finally { setSalvando(false); }
  };

  const atualizarProgresso = async (campo: "percentual_fisico" | "percentual_financeiro", valor: string) => {
    if (!obra) return;
    try {
      const atualizada = await api.atualizarObraDemanda(demandaId, obra.id, { [campo]: Number(valor) });
      setObras((atual) => atual.map((o) => (o.id === atualizada.id ? atualizada : o)));
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível atualizar o progresso");
    }
  };

  const adicionarCronograma = async () => {
    if (!obra || cronogramaForm.descricao.trim().length < 3) return notify.error("Descreva a etapa do cronograma");
    try {
      const atualizada = await api.adicionarCronogramaDemanda(demandaId, obra.id, {
        descricao: cronogramaForm.descricao.trim(),
        valor: cronogramaForm.valor ? Number(cronogramaForm.valor) : null,
        percentual_previsto: cronogramaForm.percentual_previsto ? Number(cronogramaForm.percentual_previsto) : null,
      });
      setObras((atual) => atual.map((o) => (o.id === atualizada.id ? atualizada : o)));
      setCronogramaForm({ descricao: "", valor: "", percentual_previsto: "" });
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível adicionar a etapa");
    }
  };

  const atualizarRealizado = async (itemId: string, valor: string) => {
    if (!obra) return;
    try {
      const atualizada = await api.atualizarCronogramaDemanda(demandaId, obra.id, itemId, { percentual_realizado: Number(valor) });
      setObras((atual) => atual.map((o) => (o.id === atualizada.id ? atualizada : o)));
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível atualizar a etapa");
    }
  };

  const registrarDiario = async () => {
    if (!obra || diarioForm.atividades.trim().length < 3) return notify.error("Descreva as atividades do dia");
    try {
      await api.registrarDiarioDemanda(demandaId, obra.id, {
        data: diarioForm.data, clima: diarioForm.clima,
        efetivo: diarioForm.efetivo ? Number(diarioForm.efetivo) : null,
        equipe: diarioForm.equipe || null, atividades: diarioForm.atividades,
        ocorrencias: diarioForm.ocorrencias || null, impedimentos: diarioForm.impedimentos || null,
      });
      setDiarioForm({ ...DIARIO_VAZIO });
      await carregarFilhos(obra.id);
      notify.success("Diário registrado");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível registrar o diário");
    }
  };

  const registrarVistoria = async () => {
    if (!obra || vistoriaForm.vistoriador.trim().length < 3) return notify.error("Informe o vistoriador");
    try {
      await api.registrarVistoriaDemanda(demandaId, obra.id, { ...vistoriaForm });
      setVistoriaForm({ ...VISTORIA_VAZIA });
      await carregarFilhos(obra.id);
      notify.success("Vistoria registrada");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível registrar a vistoria");
    }
  };

  const enviarFoto = async () => {
    if (!obra || !fotoArquivo) return notify.error("Selecione a foto");
    setSalvando(true);
    try {
      const doc = await api.uploadDocumentoDemanda(demandaId, fotoArquivo, {
        pasta: "Fotos de obra",
        descricao: fotoForm.observacao || `Foto da obra ${obra.nome ?? ""}`.trim(),
      });
      const foto = await api.registrarFotoDemanda(demandaId, obra.id, {
        data: hoje(), observacao: fotoForm.observacao || null, etapa: fotoForm.etapa || null,
      });
      await api.anexarFotoDemanda(demandaId, obra.id, foto.id, doc.id);
      setFotoArquivo(null);
      setFotoForm({ observacao: "", etapa: "" });
      await carregarFilhos(obra.id);
      notify.success("Foto anexada");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível anexar a foto");
    } finally { setSalvando(false); }
  };

  if (carregando) return <div className="h-40 animate-pulse rounded-xl bg-slate-200" />;

  if (!obras.length) {
    return (
      <div className="space-y-5">
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <HardHat className="mx-auto h-6 w-6 text-slate-300" />
          <p className="mt-2 text-sm text-slate-600">Nenhuma obra vinculada a esta demanda.</p>
          {podeEditar && !mostrarObraForm && (
            <button onClick={() => setMostrarObraForm(true)} className="mt-4 inline-flex items-center gap-1 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white">
              <Plus className="h-4 w-4" />Cadastrar obra
            </button>
          )}
          {mostrarObraForm && (
            <FormObra form={obraForm} setForm={setObraForm} onSalvar={criarObra} onCancelar={() => setMostrarObraForm(false)} salvando={salvando} />
          )}
        </section>
        {/* A medição pende da demanda, não da obra: precisa existir mesmo que a
            obra ainda não tenha sido cadastrada. */}
        <SecaoMedicoes
          medicoes={medicoes}
          form={medicaoForm}
          setForm={setMedicaoForm}
          podeEditar={podeEditar}
          onRegistrar={registrarMedicao}
          onAprovar={aprovarMedicao}
          onExcluir={excluirMedicao}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-semibold text-slate-600">
          Obra
          <select value={obraId} onChange={(e) => setObraId(e.target.value)} className="ml-2 h-9 rounded-lg border border-slate-300 px-2 text-sm">
            {obras.map((o) => <option key={o.id} value={o.id}>{o.nome || o.endereco || "Obra sem nome"}</option>)}
          </select>
        </label>
        {podeEditar && !mostrarObraForm && (
          <button onClick={() => setMostrarObraForm(true)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-blue-500">
            <Plus className="h-3.5 w-3.5" />Nova obra
          </button>
        )}
      </div>

      {mostrarObraForm && (
        <FormObra form={obraForm} setForm={setObraForm} onSalvar={criarObra} onCancelar={() => setMostrarObraForm(false)} salvando={salvando} />
      )}

      {obra && (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Progresso titulo="Execução física" valor={obra.percentual_fisico} editavel={podeEditar} onSalvar={(v) => atualizarProgresso("percentual_fisico", v)} />
              <Progresso titulo="Execução financeira" valor={obra.percentual_financeiro} editavel={podeEditar} onSalvar={(v) => atualizarProgresso("percentual_financeiro", v)} />
              <div className="text-sm">
                <p className="text-xs text-slate-500">Contrato / valor</p>
                <p className="mt-1 font-semibold text-slate-800">{obra.contrato_numero || "Sem contrato"}</p>
                <p className="text-slate-600">{obra.valor_contrato != null ? formatCurrency(Number(obra.valor_contrato)) : "Valor não informado"}</p>
                <p className="mt-1 text-xs text-slate-500">Previsão: {obra.previsao_conclusao ? formatDate(obra.previsao_conclusao) : "não definida"}</p>
              </div>
            </div>
            {(obra.empresa || obra.endereco) && (
              <p className="mt-4 text-sm text-slate-600">{obra.empresa && <>Empresa: <strong>{obra.empresa}</strong>. </>}{obra.endereco}</p>
            )}
          </section>

          <nav className="flex gap-1 border-b border-slate-200" aria-label="Seções da obra">
            {([["cronograma", "Cronograma"], ["diario", "Diário"], ["fotos", "Fotos"], ["vistorias", "Vistorias"], ["medicoes", "Medições"]] as const).map(([key, label]) => (
              <button key={key} onClick={() => setSub(key)} className={cn("inline-flex items-center gap-1.5 px-4 py-3 text-sm font-semibold", sub === key ? "border-b-2 border-blue-700 text-blue-700" : "text-slate-500 hover:text-slate-800")}>
                {key === "cronograma" ? <ClipboardCheck className="h-4 w-4" /> : key === "diario" ? <NotebookPen className="h-4 w-4" /> : key === "fotos" ? <Camera className="h-4 w-4" /> : <ClipboardCheck className="h-4 w-4" />}
                {label}
              </button>
            ))}
          </nav>

          {sub === "cronograma" && (
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              {podeEditar && (
                <div className="mb-4 flex flex-wrap gap-2">
                  <input value={cronogramaForm.descricao} onChange={(e) => setCronogramaForm({ ...cronogramaForm, descricao: e.target.value })} placeholder="Etapa (ex.: Fundação)" className="h-9 flex-1 rounded-lg border border-slate-300 px-3 text-sm" />
                  <input value={cronogramaForm.valor} onChange={(e) => setCronogramaForm({ ...cronogramaForm, valor: e.target.value })} inputMode="decimal" placeholder="Valor" className="h-9 w-28 rounded-lg border border-slate-300 px-3 text-sm" />
                  <input value={cronogramaForm.percentual_previsto} onChange={(e) => setCronogramaForm({ ...cronogramaForm, percentual_previsto: e.target.value })} inputMode="decimal" placeholder="% prev." className="h-9 w-24 rounded-lg border border-slate-300 px-3 text-sm" />
                  <button onClick={adicionarCronograma} className="rounded-lg bg-blue-700 px-3 text-sm font-semibold text-white">Adicionar</button>
                </div>
              )}
              <ul className="space-y-2">
                {obra.cronograma.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 p-3 text-sm">
                    <span className="min-w-40 flex-1 font-medium text-slate-800">{item.descricao}</span>
                    <span className="text-xs text-slate-500">prev. {pctLabel(item.percentual_previsto)}%</span>
                    {podeEditar ? (
                      <label className="flex items-center gap-1 text-xs text-slate-600">
                        real.
                        <input type="number" min={0} max={100} defaultValue={String(pct(item.percentual_realizado))} onBlur={(e) => atualizarRealizado(item.id, e.target.value)} className="h-8 w-20 rounded-lg border border-slate-300 px-2" aria-label={`Percentual realizado de ${item.descricao}`} />
                        %
                      </label>
                    ) : (
                      <span className="text-xs font-semibold text-slate-700">{pctLabel(item.percentual_realizado)}%</span>
                    )}
                  </li>
                ))}
                {!obra.cronograma.length && <li className="py-3 text-center text-xs text-slate-500">Cronograma ainda não detalhado.</li>}
              </ul>
            </section>
          )}

          {sub === "diario" && (
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              {podeEditar && (
                <div className="mb-4 grid gap-2 sm:grid-cols-2">
                  <input type="date" value={diarioForm.data} onChange={(e) => setDiarioForm({ ...diarioForm, data: e.target.value })} aria-label="Data" className="h-9 rounded-lg border border-slate-300 px-3 text-sm" />
                  <select value={diarioForm.clima} onChange={(e) => setDiarioForm({ ...diarioForm, clima: e.target.value })} aria-label="Clima" className="h-9 rounded-lg border border-slate-300 px-3 text-sm">
                    {CLIMAS.map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <textarea value={diarioForm.atividades} onChange={(e) => setDiarioForm({ ...diarioForm, atividades: e.target.value })} placeholder="Atividades executadas" rows={2} className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
                  <input value={diarioForm.ocorrencias} onChange={(e) => setDiarioForm({ ...diarioForm, ocorrencias: e.target.value })} placeholder="Ocorrências" className="h-9 rounded-lg border border-slate-300 px-3 text-sm" />
                  <input value={diarioForm.impedimentos} onChange={(e) => setDiarioForm({ ...diarioForm, impedimentos: e.target.value })} placeholder="Impedimentos" className="h-9 rounded-lg border border-slate-300 px-3 text-sm" />
                  <button onClick={registrarDiario} className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white sm:col-span-2">Registrar diário</button>
                </div>
              )}
              <ul className="space-y-2">
                {diario.map((d) => (
                  <li key={d.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 p-3">
                    <div className="text-sm">
                      <p className="font-semibold text-slate-800">{formatDate(d.data)} · {d.clima || "clima não informado"}</p>
                      <p className="mt-1 text-slate-600">{d.atividades}</p>
                      {d.ocorrencias && <p className="mt-1 text-xs text-amber-700">Ocorrência: {d.ocorrencias}</p>}
                      {d.impedimentos && <p className="mt-1 text-xs text-red-700">Impedimento: {d.impedimentos}</p>}
                    </div>
                    {podeEditar && <button onClick={() => api.excluirDiarioDemanda(demandaId, obra.id, d.id).then(() => carregarFilhos(obra.id))} aria-label="Remover registro" className="shrink-0 rounded p-1 text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>}
                  </li>
                ))}
                {!diario.length && <li className="py-3 text-center text-xs text-slate-500">Nenhum registro de diário.</li>}
              </ul>
            </section>
          )}

          {sub === "fotos" && (
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              {podeEditar && (
                <div className="mb-4 grid gap-2 sm:grid-cols-2">
                  <input type="file" accept="image/*" onChange={(e) => setFotoArquivo(e.target.files?.[0] ?? null)} aria-label="Foto" className="text-sm" />
                  <input value={fotoForm.etapa} onChange={(e) => setFotoForm({ ...fotoForm, etapa: e.target.value })} placeholder="Fase (ex.: Fundação)" className="h-9 rounded-lg border border-slate-300 px-3 text-sm" />
                  <input value={fotoForm.observacao} onChange={(e) => setFotoForm({ ...fotoForm, observacao: e.target.value })} placeholder="Descrição da foto" className="h-9 rounded-lg border border-slate-300 px-3 text-sm sm:col-span-2" />
                  <button onClick={enviarFoto} disabled={salvando || !fotoArquivo} className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2">Anexar foto</button>
                </div>
              )}
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {fotos.map((f) => (
                  <li key={f.id} className="rounded-lg border border-slate-100 p-3 text-sm">
                    <p className="font-semibold text-slate-800">{f.etapa || "Sem fase"}</p>
                    <p className="text-xs text-slate-500">{formatDate(f.data)}</p>
                    {f.observacao && <p className="mt-1 text-slate-600">{f.observacao}</p>}
                  </li>
                ))}
                {!fotos.length && <li className="py-3 text-center text-xs text-slate-500 sm:col-span-2 lg:col-span-3">Nenhuma foto registrada.</li>}
              </ul>
            </section>
          )}

          {sub === "vistorias" && (
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              {podeEditar && (
                <div className="mb-4 grid gap-2 sm:grid-cols-2">
                  <input type="date" value={vistoriaForm.data} onChange={(e) => setVistoriaForm({ ...vistoriaForm, data: e.target.value })} aria-label="Data" className="h-9 rounded-lg border border-slate-300 px-3 text-sm" />
                  <select value={vistoriaForm.tipo} onChange={(e) => setVistoriaForm({ ...vistoriaForm, tipo: e.target.value })} aria-label="Tipo" className="h-9 rounded-lg border border-slate-300 px-3 text-sm">
                    {Object.entries(VISTORIA_TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <input value={vistoriaForm.vistoriador} onChange={(e) => setVistoriaForm({ ...vistoriaForm, vistoriador: e.target.value })} placeholder="Vistoriador" className="h-9 rounded-lg border border-slate-300 px-3 text-sm" />
                  <select value={vistoriaForm.status} onChange={(e) => setVistoriaForm({ ...vistoriaForm, status: e.target.value })} aria-label="Situação" className="h-9 rounded-lg border border-slate-300 px-3 text-sm">
                    {Object.entries(VISTORIA_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <textarea value={vistoriaForm.observacoes} onChange={(e) => setVistoriaForm({ ...vistoriaForm, observacoes: e.target.value })} placeholder="Observações" rows={2} className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2" />
                  <button onClick={registrarVistoria} className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white sm:col-span-2">Registrar vistoria</button>
                </div>
              )}
              <ul className="space-y-2">
                {vistorias.map((v) => (
                  <li key={v.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 p-3 text-sm">
                    <div>
                      <p className="font-semibold text-slate-800">{VISTORIA_TIPOS[v.tipo ?? ""] ?? v.tipo} · {formatDate(v.data)}</p>
                      <p className="text-xs text-slate-500">{v.vistoriador || "Vistoriador não informado"} · {VISTORIA_STATUS[v.status ?? ""] ?? v.status}</p>
                      {v.observacoes && <p className="mt-1 text-slate-600">{v.observacoes}</p>}
                    </div>
                    {podeEditar && <button onClick={() => api.excluirVistoriaDemanda(demandaId, obra.id, v.id).then(() => carregarFilhos(obra.id))} aria-label="Remover vistoria" className="shrink-0 rounded p-1 text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>}
                  </li>
                ))}
                {!vistorias.length && <li className="py-3 text-center text-xs text-slate-500">Nenhuma vistoria registrada.</li>}
              </ul>
            </section>
          )}

          {sub === "medicoes" && (
            <SecaoMedicoes
              medicoes={medicoes}
              form={medicaoForm}
              setForm={setMedicaoForm}
              podeEditar={podeEditar}
              onRegistrar={registrarMedicao}
              onAprovar={aprovarMedicao}
              onExcluir={excluirMedicao}
            />
          )}
        </>
      )}
    </div>
  );
}

function Progresso({ titulo, valor, editavel, onSalvar }: {
  titulo: string; valor: number | string | null; editavel: boolean; onSalvar: (v: string) => void;
}) {
  const n = pct(valor);
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{titulo}</span>
        {editavel ? (
          <span className="flex items-center gap-1">
            <input type="number" min={0} max={100} defaultValue={String(n)} onBlur={(e) => onSalvar(e.target.value)} className="h-7 w-16 rounded border border-slate-300 px-1 text-right" aria-label={titulo} />%
          </span>
        ) : (
          <span className="font-semibold text-slate-700">{pctLabel(valor)}%</span>
        )}
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
        <div className={cn("h-full", n >= 100 ? "bg-emerald-600" : "bg-blue-600")} style={{ width: `${n}%` }} />
      </div>
    </div>
  );
}

function FormObra({ form, setForm, onSalvar, onCancelar, salvando }: {
  form: typeof OBRA_VAZIA; setForm: (f: typeof OBRA_VAZIA) => void; onSalvar: () => void; onCancelar: () => void; salvando: boolean;
}) {
  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50/50 p-5">
      <h3 className="text-sm font-bold text-slate-900">Nova obra vinculada à demanda</h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Nome da obra" className="h-9 rounded-lg border border-slate-300 px-3 text-sm" />
        <input value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} placeholder="Endereço / local" className="h-9 rounded-lg border border-slate-300 px-3 text-sm" />
        <input value={form.empresa} onChange={(e) => setForm({ ...form, empresa: e.target.value })} placeholder="Empresa" className="h-9 rounded-lg border border-slate-300 px-3 text-sm" />
        <input value={form.contrato_numero} onChange={(e) => setForm({ ...form, contrato_numero: e.target.value })} placeholder="Nº do contrato" className="h-9 rounded-lg border border-slate-300 px-3 text-sm" />
        <input value={form.valor_contrato} onChange={(e) => setForm({ ...form, valor_contrato: e.target.value })} inputMode="decimal" placeholder="Valor do contrato" className="h-9 rounded-lg border border-slate-300 px-3 text-sm" />
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onCancelar} className="rounded-lg px-3 py-2 text-sm">Cancelar</button>
        <button onClick={onSalvar} disabled={salvando} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Salvar obra</button>
      </div>
    </section>
  );
}

function SecaoMedicoes({ medicoes, form, setForm, podeEditar, onRegistrar, onAprovar, onExcluir }: {
  medicoes: Medicao[];
  form: MedicaoForm;
  setForm: (f: MedicaoForm) => void;
  podeEditar: boolean;
  onRegistrar: () => void;
  onAprovar: (id: string) => void;
  onExcluir: (id: string) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-bold text-slate-900">Medições</h3>
      <p className="text-xs text-slate-500">Acompanhamento gerencial da execução — não substitui o sistema contábil.</p>

      {podeEditar && (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <input value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value.replace(/\D/g, "") })} inputMode="numeric" placeholder="Nº" aria-label="Número da medição" className="h-9 rounded-lg border border-slate-300 px-3 text-sm" />
          <input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} aria-label="Data da medição" className="h-9 rounded-lg border border-slate-300 px-3 text-sm" />
          <input value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} inputMode="decimal" placeholder="Valor" aria-label="Valor" className="h-9 rounded-lg border border-slate-300 px-3 text-sm" />
          <input value={form.percentual} onChange={(e) => setForm({ ...form, percentual: e.target.value })} inputMode="decimal" placeholder="% da medição" aria-label="Percentual da medição" className="h-9 rounded-lg border border-slate-300 px-3 text-sm" />
          <input value={form.percentual_acumulado} onChange={(e) => setForm({ ...form, percentual_acumulado: e.target.value })} inputMode="decimal" placeholder="% acumulado" aria-label="Percentual acumulado" className="h-9 rounded-lg border border-slate-300 px-3 text-sm" />
          <input value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} placeholder="Observação" aria-label="Observação" className="h-9 rounded-lg border border-slate-300 px-3 text-sm" />
          <button onClick={onRegistrar} className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white sm:col-span-3">Registrar medição</button>
        </div>
      )}

      <ul className="mt-4 space-y-2">
        {medicoes.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 p-3 text-sm">
            <div>
              <p className="font-semibold text-slate-800">Medição nº {m.numero} · {formatDate(m.data)}</p>
              <p className="text-xs text-slate-500">
                {m.valor != null ? formatCurrency(Number(m.valor)) : "valor não informado"}
                {m.percentual != null && ` · ${pctLabel(m.percentual)}%`}
                {m.percentual_acumulado != null && ` (acum. ${pctLabel(m.percentual_acumulado)}%)`}
              </p>
              {m.observacao && <p className="mt-1 text-xs text-slate-500">{m.observacao}</p>}
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${m.status === "APROVADA" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{m.status}</span>
              {podeEditar && m.status !== "APROVADA" && (
                <button onClick={() => onAprovar(m.id)} className="rounded px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">Aprovar</button>
              )}
              {podeEditar && (
                <button onClick={() => onExcluir(m.id)} aria-label={`Remover medição ${m.numero}`} className="rounded p-1 text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
              )}
            </div>
          </li>
        ))}
        {!medicoes.length && <li className="py-3 text-center text-xs text-slate-500">Nenhuma medição registrada.</li>}
      </ul>
    </section>
  );
}
