"use client";

/**
 * Editor visual de workflow (§17, §18, §207, §208).
 *
 * O fluxo é um desenho versionado: editar não altera demandas em andamento.
 * Salvar escreve no rascunho; publicar congela a nova versão e arquiva a
 * anterior. Modelos do sistema não são editáveis — clonar é o caminho.
 */

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, GitBranch, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PERM } from "@/lib/perfil";
import { notify } from "@/components/ui/Toast";
import type { EtapaModelo, WorkflowDetalhe, WorkflowResumo } from "@/types/govtask";

const MODOS = ["SEQUENCIAL", "PARALELA"];
const NATUREZAS = ["INTERNA", "GOVERNO"];
const REGRAS = ["TODAS_TAREFAS", "QUALQUER_TAREFA", "MANUAL"];
const CONTAGENS = ["DIAS_UTEIS", "DIAS_CORRIDOS", "HORAS", "DATA_FIXA"];
const CAMPO = "h-8 rounded-lg border border-slate-300 px-2 text-xs";

function novaEtapa(ordem: number): EtapaModelo {
  return {
    chave: `etapa-${ordem}-${Math.random().toString(36).slice(2, 6)}`,
    nome: `Etapa ${ordem}`,
    ordem,
    peso: 0,
    modo: "SEQUENCIAL",
    natureza: "INTERNA",
    regra_conclusao: "TODAS_TAREFAS",
    tipo_contagem: "DIAS_UTEIS",
    exige_aprovacao: false,
    is_final: false,
    prazo_dias: null,
    setor_responsavel_id: null,
  };
}

function payload(etapa: EtapaModelo, ordem: number) {
  return {
    chave: etapa.chave,
    nome: etapa.nome,
    descricao: etapa.descricao ?? undefined,
    ordem,
    peso: Number(etapa.peso) || 0,
    modo: etapa.modo,
    natureza: etapa.natureza,
    regra_conclusao: etapa.regra_conclusao,
    setor_responsavel_id: etapa.setor_responsavel_id || undefined,
    prazo_dias: etapa.prazo_dias === null || etapa.prazo_dias === undefined ? undefined : Number(etapa.prazo_dias),
    tipo_contagem: etapa.tipo_contagem,
    exige_aprovacao: etapa.exige_aprovacao,
    is_final: etapa.is_final,
  };
}

export default function WorkflowsAdminPage() {
  const { hasPermission } = useAuth();
  const podeAdministrar = hasPermission(PERM.ADMIN);
  const [workflows, setWorkflows] = useState<WorkflowResumo[]>([]);
  const [detalhe, setDetalhe] = useState<WorkflowDetalhe | null>(null);
  const [etapas, setEtapas] = useState<EtapaModelo[]>([]);
  const [rascunhoId, setRascunhoId] = useState<string | null>(null);
  const [setores, setSetores] = useState<{ id: string; nome: string; sigla?: string | null }[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [clonar, setClonar] = useState<{ origem: WorkflowResumo; chave: string; nome: string } | null>(null);

  const carregarLista = useCallback(async () => {
    try {
      setWorkflows(await api.listarWorkflows());
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível carregar os workflows");
    }
  }, []);

  useEffect(() => {
    carregarLista();
    api.listSetores().then(setSetores).catch(() => setSetores([]));
  }, [carregarLista]);

  const carregarDetalhe = useCallback(async (id: string) => {
    const d = await api.getWorkflow(id);
    setDetalhe(d);
    const rascunho = d.versoes.find((v) => v.status === "RASCUNHO");
    if (rascunho) {
      setRascunhoId(rascunho.id);
      setEtapas(rascunho.etapas.map((e) => ({ ...e })).sort((a, b) => a.ordem - b.ordem));
    } else {
      setRascunhoId(null);
      const publicada = d.versoes.find((v) => v.status === "PUBLICADA");
      setEtapas((publicada?.etapas ?? []).map((e) => ({ ...e })).sort((a, b) => a.ordem - b.ordem));
    }
    return d;
  }, []);

  const abrir = (wf: WorkflowResumo) => carregarDetalhe(wf.id).catch((e) => notify.error(e.message));

  const abrirRascunho = async () => {
    if (!detalhe) return;
    setSalvando(true);
    try {
      await api.abrirVersaoWorkflow(detalhe.id);
      await carregarDetalhe(detalhe.id);
      notify.success("Rascunho aberto a partir da versão publicada");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível abrir o rascunho");
    } finally {
      setSalvando(false);
    }
  };

  const alterar = (indice: number, patch: Partial<EtapaModelo>) =>
    setEtapas((prev) => prev.map((e, i) => (i === indice ? { ...e, ...patch } : e)));

  const mover = (indice: number, delta: number) => {
    setEtapas((prev) => {
      const destino = indice + delta;
      if (destino < 0 || destino >= prev.length) return prev;
      const copia = [...prev];
      [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
      return copia;
    });
  };

  const adicionar = () => setEtapas((prev) => [...prev, novaEtapa(prev.length + 1)]);
  const remover = (indice: number) => setEtapas((prev) => prev.filter((_, i) => i !== indice));

  const salvar = async () => {
    if (!detalhe || !rascunhoId) return false;
    const soma = etapas.reduce((total, e) => total + (Number(e.peso) || 0), 0);
    if (soma !== 0 && soma !== 100) {
      notify.error(`Os pesos devem somar 100 (ou 0); somam ${soma}`);
      return false;
    }
    setSalvando(true);
    try {
      await api.salvarRascunhoWorkflow(detalhe.id, etapas.map((e, i) => payload(e, i + 1)));
      await carregarDetalhe(detalhe.id);
      notify.success("Rascunho salvo");
      return true;
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível salvar o rascunho");
      return false;
    } finally {
      setSalvando(false);
    }
  };

  const publicar = async () => {
    if (!detalhe || !rascunhoId) return;
    const ok = await salvar();
    if (!ok) return;
    setSalvando(true);
    try {
      await api.publicarWorkflow(detalhe.id);
      await carregarDetalhe(detalhe.id);
      await carregarLista();
      notify.success("Nova versão publicada");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível publicar");
    } finally {
      setSalvando(false);
    }
  };

  const criarClone = async () => {
    if (!clonar) return;
    if (clonar.chave.trim().length < 2 || clonar.nome.trim().length < 2) {
      return notify.error("Informe chave e nome");
    }
    setSalvando(true);
    try {
      const criado = await api.criarWorkflow({
        chave: clonar.chave.trim(),
        nome: clonar.nome.trim(),
        copiar_de_id: clonar.origem.id,
      });
      setClonar(null);
      await carregarLista();
      await abrir(criado);
      notify.success("Workflow clonado");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível clonar");
    } finally {
      setSalvando(false);
    }
  };

  if (!podeAdministrar) {
    return <div className="rounded-xl bg-amber-50 p-5 text-sm text-amber-900">Você não tem permissão para administrar workflows do GovTask.</div>;
  }

  const somaPesos = etapas.reduce((total, e) => total + (Number(e.peso) || 0), 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[.15em] text-blue-700">Configurações</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Workflows</h1>
        <p className="mt-1 text-sm text-slate-600">
          Desenho versionado do fluxo. Editar um rascunho não afeta demandas em andamento (§208).
        </p>
      </header>

      {!detalhe && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {workflows.map((w) => (
            <article key={w.id} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <GitBranch className="h-4 w-4 text-blue-700" aria-hidden="true" />
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${w.is_system ? "bg-slate-100 text-slate-600" : "bg-blue-50 text-blue-700"}`}>
                  {w.is_system ? "sistema" : "próprio"}{w.ativo ? "" : " · inativo"}
                </span>
              </div>
              <h2 className="mt-3 font-bold text-slate-900">{w.nome}</h2>
              <p className="mt-1 text-xs text-slate-500">{w.chave} · v{w.versao_atual ?? "—"} · {w.qtd_etapas} etapa(s)</p>
              <div className="mt-4 flex gap-2">
                <button onClick={() => abrir(w)} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">Abrir</button>
                {w.is_system && (
                  <button
                    onClick={() => setClonar({ origem: w, chave: `${w.chave}-copia`, nome: `${w.nome} (cópia)` })}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
                  >
                    Clonar
                  </button>
                )}
              </div>
            </article>
          ))}
          {!workflows.length && <p className="text-sm text-slate-500">Nenhum workflow disponível.</p>}
        </section>
      )}

      {detalhe && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <button onClick={() => { setDetalhe(null); setRascunhoId(null); }} className="text-xs font-semibold text-slate-500 hover:text-blue-700">← Voltar</button>
              <h2 className="mt-1 text-xl font-bold text-slate-900">{detalhe.nome}</h2>
              <p className="text-xs text-slate-500">
                {detalhe.is_system ? "modelo do sistema (não editável)" : "workflow próprio"} · versão publicada {detalhe.versao_atual ?? "—"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!detalhe.is_system && !rascunhoId && (
                <button onClick={abrirRascunho} disabled={salvando} className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Editar (abrir rascunho)</button>
              )}
              {!detalhe.is_system && rascunhoId && (
                <>
                  <button onClick={salvar} disabled={salvando} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50">Salvar rascunho</button>
                  <button onClick={publicar} disabled={salvando} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Publicar</button>
                </>
              )}
            </div>
          </div>

          {rascunhoId && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
              <span>Rascunho em edição — demandas em andamento seguem na versão publicada.</span>
              <span className={somaPesos === 0 || somaPesos === 100 ? "font-semibold text-emerald-700" : "font-semibold text-red-700"}>Pesos somam {somaPesos}%</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 overflow-auto rounded-xl border border-slate-200 bg-white p-4">
            {etapas.map((e, i) => (
              <div key={e.chave} className="flex items-center gap-2">
                <span className="whitespace-nowrap rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800">
                  {e.ordem}. {e.nome} {e.peso ? `· ${e.peso}%` : ""}{e.modo === "PARALELA" ? " ∥" : ""}{e.is_final ? " ✓" : ""}
                </span>
                {i < etapas.length - 1 && <span className="text-slate-300">→</span>}
              </div>
            ))}
            {!etapas.length && <span className="text-xs text-slate-500">Sem etapas. Adicione a primeira abaixo.</span>}
          </div>

          <div className="space-y-3">
            {etapas.map((e, i) => (
              <div key={e.chave} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{i + 1}</span>
                  <input disabled={!rascunhoId} value={e.nome} onChange={(ev) => alterar(i, { nome: ev.target.value })} className={`${CAMPO} w-48`} placeholder="Nome da etapa" aria-label="Nome da etapa" />
                  <label className="flex items-center gap-1 text-xs text-slate-600">Peso
                    <input type="number" min={0} max={100} disabled={!rascunhoId} value={e.peso} onChange={(ev) => alterar(i, { peso: Number(ev.target.value) })} className={`${CAMPO} w-16`} aria-label="Peso da etapa" />
                  </label>
                  <select disabled={!rascunhoId} value={e.modo} onChange={(ev) => alterar(i, { modo: ev.target.value as EtapaModelo["modo"] })} className={CAMPO} aria-label="Modo">
                    {MODOS.map((m) => <option key={m}>{m}</option>)}
                  </select>
                  <select disabled={!rascunhoId} value={e.natureza} onChange={(ev) => alterar(i, { natureza: ev.target.value as EtapaModelo["natureza"] })} className={CAMPO} aria-label="Natureza">
                    {NATUREZAS.map((n) => <option key={n}>{n}</option>)}
                  </select>
                  <select disabled={!rascunhoId} value={e.regra_conclusao} onChange={(ev) => alterar(i, { regra_conclusao: ev.target.value as EtapaModelo["regra_conclusao"] })} className={CAMPO} aria-label="Regra de conclusão">
                    {REGRAS.map((r) => <option key={r}>{r}</option>)}
                  </select>
                  <select disabled={!rascunhoId} value={e.setor_responsavel_id ?? ""} onChange={(ev) => alterar(i, { setor_responsavel_id: ev.target.value || null })} className={CAMPO} aria-label="Setor responsável">
                    <option value="">Sem setor</option>
                    {setores.map((s) => <option key={s.id} value={s.id}>{s.sigla ? `${s.sigla} — ` : ""}{s.nome}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-xs text-slate-600">Prazo
                    <input type="number" min={0} disabled={!rascunhoId} value={e.prazo_dias ?? ""} onChange={(ev) => alterar(i, { prazo_dias: ev.target.value === "" ? null : Number(ev.target.value) })} className={`${CAMPO} w-16`} aria-label="Prazo em dias" />
                  </label>
                  <select disabled={!rascunhoId} value={e.tipo_contagem} onChange={(ev) => alterar(i, { tipo_contagem: ev.target.value as EtapaModelo["tipo_contagem"] })} className={CAMPO} aria-label="Contagem do prazo">
                    {CONTAGENS.map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <label className="flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" disabled={!rascunhoId} checked={e.exige_aprovacao} onChange={(ev) => alterar(i, { exige_aprovacao: ev.target.checked })} />Aprovação</label>
                  <label className="flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" disabled={!rascunhoId} checked={e.is_final} onChange={(ev) => alterar(i, { is_final: ev.target.checked })} />Final</label>
                  {rascunhoId && (
                    <span className="ml-auto flex items-center gap-1">
                      <button onClick={() => mover(i, -1)} aria-label="Mover para cima" className="rounded p-1 text-slate-500 hover:bg-slate-100"><ArrowUp className="h-4 w-4" /></button>
                      <button onClick={() => mover(i, 1)} aria-label="Mover para baixo" className="rounded p-1 text-slate-500 hover:bg-slate-100"><ArrowDown className="h-4 w-4" /></button>
                      <button onClick={() => remover(i)} aria-label="Remover etapa" className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                    </span>
                  )}
                </div>
              </div>
            ))}
            {rascunhoId && (
              <button onClick={adicionar} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-blue-400">
                <Plus className="h-4 w-4" /> Adicionar etapa
              </button>
            )}
          </div>
        </section>
      )}

      {clonar && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="clonar-titulo" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 id="clonar-titulo" className="text-lg font-bold text-slate-900">Clonar workflow</h2>
            <p className="mt-1 text-sm text-slate-500">A cópia é editável; o modelo do sistema permanece intacto.</p>
            <label className="mt-4 block text-xs font-semibold text-slate-600">Chave
              <input value={clonar.chave} onChange={(e) => setClonar({ ...clonar, chave: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-3 text-sm" />
            </label>
            <label className="mt-3 block text-xs font-semibold text-slate-600">Nome
              <input value={clonar.nome} onChange={(e) => setClonar({ ...clonar, nome: e.target.value })} className="mt-1 h-9 w-full rounded-lg border border-slate-300 px-3 text-sm" />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setClonar(null)} className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600">Cancelar</button>
              <button onClick={criarClone} disabled={salvando} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Clonar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
