"use client";

/**
 * Gestão avançada da demanda (§211, §213, §220–§222).
 *
 * Reúne marcos, riscos e vínculos com outras demandas. A separação em seções
 * mantém a leitura curta: cada bloco responde uma pergunta — o que precisa ser
 * atingido, o que pode dar errado e com o que isto se relaciona.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Link2, Plus, Target, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { notify } from "@/components/ui/Toast";
import { formatDate } from "@/lib/utils";
import type { CampoCustomizadoComValor, HierarquiaDemanda, Marco, Risco } from "@/types/govtask";

const NIVEIS: Record<string, string> = {
  BAIXO: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  MEDIO: "bg-amber-50 text-amber-800 ring-amber-200",
  ALTO: "bg-orange-50 text-orange-800 ring-orange-200",
  CRITICO: "bg-red-50 text-red-800 ring-red-200",
};

export function GestaoTab({ demandaId, podeEditar }: { demandaId: string; podeEditar: boolean }) {
  const [marcos, setMarcos] = useState<Marco[]>([]);
  const [riscos, setRiscos] = useState<Risco[]>([]);
  const [hierarquia, setHierarquia] = useState<HierarquiaDemanda>();
  const [campos, setCampos] = useState<CampoCustomizadoComValor[]>([]);
  const [valores, setValores] = useState<Record<string, unknown>>({});
  const [carregando, setCarregando] = useState(true);
  const [novoMarco, setNovoMarco] = useState("");
  const [novoRisco, setNovoRisco] = useState({ descricao: "", probabilidade: 3, impacto: 3 });
  const [busca, setBusca] = useState("");
  const [sugestoes, setSugestoes] = useState<{ id: string; numero: string; titulo: string }[]>([]);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [m, r, h] = await Promise.all([
        api.listarMarcos(demandaId),
        api.listarRiscos(demandaId),
        api.hierarquiaDemanda(demandaId),
      ]);
      setMarcos(m);
      setRiscos(r);
      setHierarquia(h);
      try {
        const { campos: definidos } = await api.camposDaDemanda(demandaId);
        setCampos(definidos);
        setValores(
          Object.fromEntries(definidos.map((c) => [c.chave, c.valor ?? ""]))
        );
      } catch {
        setCampos([]);
      }
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível carregar a gestão da demanda");
    } finally {
      setCarregando(false);
    }
  }, [demandaId]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    if (busca.trim().length < 2) { setSugestoes([]); return; }
    const timer = setTimeout(() => {
      api.sugestoesBusca(busca.trim()).then(setSugestoes).catch(() => setSugestoes([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [busca]);

  const criarMarco = async () => {
    if (novoMarco.trim().length < 3) return notify.error("Descreva o marco");
    setSalvando(true);
    try {
      await api.criarMarco(demandaId, { titulo: novoMarco.trim() });
      setNovoMarco("");
      await carregar();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível criar o marco");
    } finally { setSalvando(false); }
  };

  const concluirMarco = async (id: string) => {
    try { await api.concluirMarco(demandaId, id); await carregar(); }
    catch (e) { notify.error(e instanceof Error ? e.message : "Não foi possível concluir o marco"); }
  };

  const removerMarco = async (id: string) => {
    try { await api.removerMarco(demandaId, id); await carregar(); }
    catch (e) { notify.error(e instanceof Error ? e.message : "Não foi possível remover o marco"); }
  };

  const criarRisco = async () => {
    if (novoRisco.descricao.trim().length < 3) return notify.error("Descreva o risco");
    setSalvando(true);
    try {
      await api.criarRisco(demandaId, { ...novoRisco, descricao: novoRisco.descricao.trim() });
      setNovoRisco({ descricao: "", probabilidade: 3, impacto: 3 });
      await carregar();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível registrar o risco");
    } finally { setSalvando(false); }
  };

  const atualizarRisco = async (id: string, status: string) => {
    try { await api.atualizarRisco(demandaId, id, { status }); await carregar(); }
    catch (e) { notify.error(e instanceof Error ? e.message : "Não foi possível atualizar o risco"); }
  };

  const vincular = async (outroId: string, comoPai: boolean) => {
    try {
      if (comoPai) await api.vincularPai(demandaId, outroId);
      else await api.criarRelacionamento(demandaId, { relacionada_id: outroId });
      setBusca("");
      await carregar();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível vincular");
    }
  };

  const salvarCampos = async () => {
    setSalvando(true);
    try {
      const limpos = Object.fromEntries(
        Object.entries(valores).filter(([, v]) => v !== "" && v !== null && v !== undefined)
      );
      await api.atualizarDemandaV2(demandaId, { campos_extras: limpos });
      notify.success("Campos adicionais salvos");
      await carregar();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível salvar os campos");
    } finally { setSalvando(false); }
  };

  if (carregando) return <div className="h-40 animate-pulse rounded-xl bg-slate-200" />;

  return (
    <div className="space-y-6">
    <div className="grid gap-6 xl:grid-cols-3">
      {/* Marcos */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <header className="flex items-center gap-2">
          <Target className="h-4 w-4 text-blue-700" />
          <h2 className="font-bold text-slate-900">Marcos</h2>
        </header>
        {podeEditar && (
          <div className="mt-3 flex gap-2">
            <input value={novoMarco} onChange={(e) => setNovoMarco(e.target.value)} placeholder="Ex.: Convênio assinado" className="h-9 flex-1 rounded-lg border border-slate-300 px-3 text-sm" />
            <button onClick={criarMarco} disabled={salvando} className="rounded-lg bg-blue-700 px-3 text-white disabled:opacity-50"><Plus className="h-4 w-4" /></button>
          </div>
        )}
        <ul className="mt-4 space-y-2">
          {marcos.map((m) => (
            <li key={m.id} className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 p-3">
              <div>
                <p className={`text-sm font-semibold ${m.status === "CONCLUIDO" ? "text-slate-400 line-through" : "text-slate-800"}`}>{m.titulo}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {m.status === "CONCLUIDO" ? `Atingido em ${formatDate(m.data_realizada!)}` : m.atrasado ? "Atrasado" : "Pendente"}
                </p>
              </div>
              {podeEditar && (
                <div className="flex shrink-0 gap-1">
                  {m.status !== "CONCLUIDO" && (
                    <button onClick={() => concluirMarco(m.id)} className="rounded px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">Concluir</button>
                  )}
                  <button onClick={() => removerMarco(m.id)} className="rounded p-1 text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              )}
            </li>
          ))}
          {!marcos.length && <li className="py-4 text-center text-xs text-slate-500">Nenhum marco definido.</li>}
        </ul>
      </section>

      {/* Riscos */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <header className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-700" />
          <h2 className="font-bold text-slate-900">Riscos</h2>
        </header>
        {podeEditar && (
          <div className="mt-3 space-y-2">
            <input value={novoRisco.descricao} onChange={(e) => setNovoRisco({ ...novoRisco, descricao: e.target.value })} placeholder="O que pode dar errado" className="h-9 w-full rounded-lg border border-slate-300 px-3 text-sm" />
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <label className="flex items-center gap-1">Prob.
                <select value={novoRisco.probabilidade} onChange={(e) => setNovoRisco({ ...novoRisco, probabilidade: Number(e.target.value) })} className="rounded border border-slate-300 px-1 py-1">
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1">Impacto
                <select value={novoRisco.impacto} onChange={(e) => setNovoRisco({ ...novoRisco, impacto: Number(e.target.value) })} className="rounded border border-slate-300 px-1 py-1">
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <button onClick={criarRisco} disabled={salvando} className="ml-auto rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white disabled:opacity-50">Registrar</button>
            </div>
          </div>
        )}
        <ul className="mt-4 space-y-2">
          {riscos.map((r) => (
            <li key={r.id} className="rounded-lg border border-slate-100 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-slate-800">{r.descricao}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${NIVEIS[r.nivel]}`}>{r.nivel} · {r.score}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                <span>{r.status.replaceAll("_", " ")}</span>
                {podeEditar && r.status !== "MITIGADO" && r.status !== "ENCERRADO" && (
                  <button onClick={() => atualizarRisco(r.id, "MITIGADO")} className="font-semibold text-emerald-700 hover:underline">Marcar mitigado</button>
                )}
              </div>
            </li>
          ))}
          {!riscos.length && <li className="py-4 text-center text-xs text-slate-500">Nenhum risco registrado.</li>}
        </ul>
      </section>

      {/* Relacionamentos */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <header className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-violet-700" />
          <h2 className="font-bold text-slate-900">Relacionamentos</h2>
        </header>
        {podeEditar && (
          <div className="relative mt-3">
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar demanda por número ou título" className="h-9 w-full rounded-lg border border-slate-300 px-3 text-sm" />
            {sugestoes.length > 0 && (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                {sugestoes.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-slate-50">
                    <span className="truncate"><span className="font-mono text-xs text-slate-500">{s.numero}</span> {s.titulo}</span>
                    <span className="flex shrink-0 gap-1">
                      <button onClick={() => vincular(s.id, true)} className="rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold hover:bg-blue-100">Pai</button>
                      <button onClick={() => vincular(s.id, false)} className="rounded bg-slate-100 px-2 py-1 text-[11px] font-semibold hover:bg-violet-100">Relacionar</button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 space-y-3 text-sm">
          {hierarquia?.pai && (
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase text-slate-500">Demanda pai</p>
              <a href={`/demandas/${hierarquia.pai.id}`} className="mt-1 block font-medium text-blue-700 hover:underline">{hierarquia.pai.numero} · {hierarquia.pai.titulo}</a>
              {podeEditar && <button onClick={() => api.desvincularPai(demandaId).then(carregar)} className="mt-1 text-xs text-red-600 hover:underline">Desvincular</button>}
            </div>
          )}
          {hierarquia?.tem_filhas && (
            <div className="rounded-lg border border-blue-100 p-3">
              <p className="text-xs font-semibold uppercase text-slate-500">Filhas · progresso agregado {hierarquia.progresso_agregado}%</p>
              <ul className="mt-1 space-y-1">
                {hierarquia.filhas.map((f) => (
                  <li key={f.id}><a href={`/demandas/${f.id}`} className="text-blue-700 hover:underline">{f.numero} · {f.titulo}</a> <span className="text-xs text-slate-500">({f.progresso}%)</span></li>
                ))}
              </ul>
            </div>
          )}
          {hierarquia?.relacionamentos.length ? (
            <ul className="space-y-2">
              {hierarquia.relacionamentos.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 p-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-violet-700">{v.tipo}</p>
                    <a href={`/demandas/${v.relacionada.id}`} className="truncate text-blue-700 hover:underline">{v.relacionada.numero} · {v.relacionada.titulo}</a>
                  </div>
                  {podeEditar && <button onClick={() => api.removerRelacionamento(demandaId, v.id).then(carregar)} className="text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>}
                </li>
              ))}
            </ul>
          ) : (!hierarquia?.pai && !hierarquia?.tem_filhas && <p className="py-2 text-center text-xs text-slate-500">Sem vínculos registrados.</p>)}
        </div>
      </section>
    </div>

    {campos.length > 0 && (
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-bold text-slate-900">Campos adicionais</h2>
        <p className="text-sm text-slate-600">Informações exigidas pelo tipo desta demanda.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campos.map((campo) => (
            <CampoDinamico
              key={campo.id}
              campo={campo}
              valor={valores[campo.chave]}
              onChange={(v) => setValores((atual) => ({ ...atual, [campo.chave]: v }))}
              desabilitado={!podeEditar}
            />
          ))}
        </div>
        {podeEditar && (
          <div className="mt-4 flex justify-end">
            <button onClick={salvarCampos} disabled={salvando} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {salvando ? "Salvando…" : "Salvar campos"}
            </button>
          </div>
        )}
      </section>
    )}
    </div>
  );
}

function CampoDinamico({ campo, valor, onChange, desabilitado }: {
  campo: CampoCustomizadoComValor;
  valor: unknown;
  onChange: (v: unknown) => void;
  desabilitado: boolean;
}) {
  const base = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800 disabled:bg-slate-50";
  const rotulo = (
    <span className="text-xs font-semibold text-slate-600">
      {campo.rotulo}{campo.obrigatorio && " *"}
      {campo.ajuda && <span className="ml-1 font-normal text-slate-400">{campo.ajuda}</span>}
    </span>
  );
  if (campo.tipo === "TEXTO_LONGO") {
    return <label className="sm:col-span-2 lg:col-span-3">{rotulo}<textarea value={String(valor ?? "")} disabled={desabilitado} rows={3} onChange={(e) => onChange(e.target.value)} className={base} /></label>;
  }
  if (campo.tipo === "BOOLEANO") {
    return <label className="flex items-center gap-2 pt-5 text-sm text-slate-700"><input type="checkbox" checked={Boolean(valor)} disabled={desabilitado} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />{campo.rotulo}</label>;
  }
  if (campo.tipo === "SELECAO" || campo.tipo === "MULTIPLA_ESCOLHA") {
    return (
      <label>{rotulo}
        <select value={String(valor ?? "")} disabled={desabilitado} onChange={(e) => onChange(e.target.value)} className={base}>
          <option value="">—</option>
          {(campo.opcoes ?? []).map((o) => <option key={String(o)} value={String(o)}>{String(o)}</option>)}
        </select>
      </label>
    );
  }
  const tipo = campo.tipo === "NUMERO" || campo.tipo === "MOEDA" ? "number" : campo.tipo === "DATA" ? "date" : campo.tipo === "URL" ? "url" : "text";
  return <label>{rotulo}<input type={tipo} value={String(valor ?? "")} disabled={desabilitado} onChange={(e) => onChange(e.target.value)} className={base} /></label>;
}
