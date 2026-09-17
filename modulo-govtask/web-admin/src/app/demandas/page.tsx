"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Filter, Plus, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PERM } from "@/lib/perfil";
import { notify } from "@/components/ui/Toast";
import { VisoesBar } from "@/components/demandas/VisoesBar";
import { formatDate } from "@/lib/utils";
import type { DemandaV2, DemandaV2Page } from "@/types/govtask";

/**
 * Listagem de demandas com visões salvas, filtros rápidos e ações em lote
 * (§49, §50, §188, §189).
 *
 * As ações em lote exigem motivo e passam pela mesma autorização da operação
 * individual: o que o usuário não pode abrir, não entra no lote.
 */
export default function DemandasPage() {
  const { hasPermission } = useAuth();
  const podeEditar = hasPermission(PERM.EDIT, PERM.ADMIN);
  const [dados, setDados] = useState<DemandaV2Page>();
  const [filtros, setFiltros] = useState<Record<string, unknown>>({});
  const [tipos, setTipos] = useState<{ id: string; rotulo: string }[]>([]);
  const [nova, setNova] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [usuarios, setUsuarios] = useState<{ id: string; name: string }[]>([]);
  const [prioridade, setPrioridade] = useState("ALTA");
  const [responsavel, setResponsavel] = useState("");
  const [tag, setTag] = useState("");
  const [processando, setProcessando] = useState(false);

  const carregar = useCallback(
    async () => setDados(await api.listDemandasV2(filtros)),
    [filtros]
  );

  useEffect(() => {
    const timer = setTimeout(() => carregar(), 180);
    return () => clearTimeout(timer);
  }, [carregar]);

  useEffect(() => {
    api.catalogosDemandas().then((c) => setTipos(c.tipos)).catch(() => setTipos([]));
  }, []);

  useEffect(() => {
    if (podeEditar) api.listUsers().then(setUsuarios).catch(() => setUsuarios([]));
  }, [podeEditar]);

  async function criar(e: FormEvent) {
    e.preventDefault();
    if (!titulo.trim()) return;
    const d = await api.criarDemandaV2({ titulo });
    setNova(false);
    setTitulo("");
    window.location.href = `/demandas/${d.id}`;
  }

  /** O preset reescreve só as três chaves que ele governa; o resto é preservado. */
  const aplicarPreset = (key: "todas" | "minhas" | "atrasadas" | "externo") => {
    setFiltros((atual) => {
      const proximo = { ...atual };
      delete proximo.minhas;
      delete proximo.atrasadas;
      delete proximo.aguardando_terceiro;
      if (key === "minhas") proximo.minhas = true;
      if (key === "atrasadas") proximo.atrasadas = true;
      if (key === "externo") proximo.aguardando_terceiro = true;
      return proximo;
    });
  };

  const presetAtual = filtros.minhas ? "minhas" : filtros.atrasadas ? "atrasadas" : filtros.aguardando_terceiro ? "externo" : "todas";

  const aplicarVisao = (novos: Record<string, unknown>) => {
    setFiltros({ ...novos });
    setSelecionadas(new Set());
  };

  const definir = (chave: string, valor: unknown) =>
    setFiltros((atual) => {
      const proximo = { ...atual };
      if (valor === "" || valor === undefined || valor === null) delete proximo[chave];
      else proximo[chave] = valor;
      return proximo;
    });

  const alternar = (id: string) =>
    setSelecionadas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });

  const executarLote = async (acao: () => Promise<{ atualizadas: number; ignoradas: string[] }>) => {
    setProcessando(true);
    try {
      const r = await acao();
      notify.success(`${r.atualizadas} demanda(s) atualizada(s)${r.ignoradas.length ? ` · ${r.ignoradas.length} ignorada(s)` : ""}`);
      setSelecionadas(new Set());
      await carregar();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível concluir a ação");
    } finally {
      setProcessando(false);
    }
  };

  const aplicarPrioridade = () => {
    const motivo = window.prompt("Motivo da alteração de prioridade (fica na auditoria)");
    if (!motivo || motivo.trim().length < 3) return notify.error("Informe o motivo");
    executarLote(() => api.lotePrioridade(Array.from(selecionadas), prioridade, motivo.trim()));
  };

  const aplicarResponsavel = () => {
    if (!responsavel) return notify.error("Escolha o responsável");
    const motivo = window.prompt("Motivo da reatribuição (fica na auditoria)");
    if (!motivo || motivo.trim().length < 3) return notify.error("Informe o motivo");
    executarLote(() => api.loteAtribuir(Array.from(selecionadas), responsavel, motivo.trim()));
  };

  const aplicarTag = () => {
    if (!tag.trim()) return notify.error("Informe a tag");
    const motivo = window.prompt("Motivo da inclusão de tag (fica na auditoria)");
    if (!motivo || motivo.trim().length < 3) return notify.error("Informe o motivo");
    executarLote(() => api.loteTags(Array.from(selecionadas), tag.split(",").map((t) => t.trim()).filter(Boolean), motivo.trim()));
  };

  const itens = dados?.items ?? [];
  const todasSelecionadas = itens.length > 0 && itens.every((d) => selecionadas.has(d.id));
  const temFiltro = Object.keys(filtros).length > 0;

  return (
    <div className="max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.15em] text-blue-700">Dossiês municipais</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Demandas</h1>
          <p className="mt-1 text-sm text-slate-600">Cada determinação acompanhada até a entrega final.</p>
        </div>
        <button onClick={() => setNova(true)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
          <Plus className="h-4 w-4" />Nova demanda
        </button>
      </header>

      <VisoesBar filtrosAtuais={filtros} onAplicar={aplicarVisao} />

      <section className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex flex-col gap-3 lg:flex-row">
          <label className="flex flex-1 items-center gap-2 rounded-lg bg-slate-50 px-3">
            <Search className="h-4 w-4 text-slate-400" />
            <input value={String(filtros.busca ?? "")} onChange={(e) => definir("busca", e.target.value)} placeholder="Buscar por número, título, objeto ou assunto" className="h-10 w-full bg-transparent text-sm outline-none" />
          </label>
          <div className="flex gap-2 overflow-auto">
            {([["todas", "Todas"], ["minhas", "Sob minha gestão"], ["atrasadas", "Atrasadas"], ["externo", "Aguardando externo"]] as const).map(([key, label]) => (
              <button key={key} onClick={() => aplicarPreset(key)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold ${presetAtual === key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center">
          <select value={String(filtros.prioridade ?? "")} onChange={(e) => definir("prioridade", e.target.value)} aria-label="Prioridade" className="h-9 rounded-lg border border-slate-300 px-2 text-xs text-slate-700">
            <option value="">Prioridade: todas</option>
            {["BAIXA", "NORMAL", "ALTA", "URGENTE", "CRITICA"].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={String(filtros.tipo_id ?? "")} onChange={(e) => definir("tipo_id", e.target.value)} aria-label="Tipo de demanda" className="h-9 rounded-lg border border-slate-300 px-2 text-xs text-slate-700">
            <option value="">Tipo: todos</option>
            {tipos.map((t) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
          </select>
          <input inputMode="numeric" value={String(filtros.exercicio ?? "")} onChange={(e) => definir("exercicio", e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="Exercício (ex.: 2026)" aria-label="Exercício" className="h-9 w-40 rounded-lg border border-slate-300 px-2 text-xs" />
          {temFiltro && (
            <button onClick={() => setFiltros({})} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-blue-700">
              <X className="h-3.5 w-3.5" />Limpar filtros
            </button>
          )}
        </div>
      </section>

      {podeEditar && selecionadas.size > 0 && (
        <section className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm">
          <span className="font-semibold text-blue-900">{selecionadas.size} selecionada(s)</span>
          <span className="text-blue-200">|</span>
          <select value={prioridade} onChange={(e) => setPrioridade(e.target.value)} className="h-8 rounded-lg border border-blue-200 bg-white px-2 text-xs">
            {["BAIXA", "NORMAL", "ALTA", "URGENTE", "CRITICA"].map((p) => <option key={p}>{p}</option>)}
          </select>
          <button onClick={aplicarPrioridade} disabled={processando} className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-blue-800 ring-1 ring-blue-200 disabled:opacity-50">Alterar prioridade</button>
          <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className="h-8 rounded-lg border border-blue-200 bg-white px-2 text-xs">
            <option value="">Responsável…</option>
            {usuarios.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <button onClick={aplicarResponsavel} disabled={processando} className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-blue-800 ring-1 ring-blue-200 disabled:opacity-50">Reatribuir</button>
          <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="tag1, tag2" className="h-8 w-32 rounded-lg border border-blue-200 px-2 text-xs" />
          <button onClick={aplicarTag} disabled={processando} className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-blue-800 ring-1 ring-blue-200 disabled:opacity-50">Adicionar tags</button>
          <button onClick={() => setSelecionadas(new Set())} className="ml-auto text-xs font-semibold text-blue-700 hover:underline">Limpar</button>
        </section>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{dados ? `${dados.total} demanda(s) encontrada(s)` : "Carregando demandas…"}</p>
        {podeEditar && itens.length > 0 && (
          <button onClick={() => setSelecionadas(todasSelecionadas ? new Set() : new Set(itens.map((d) => d.id)))} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-blue-700">
            <Filter className="h-3.5 w-3.5" />{todasSelecionadas ? "Limpar seleção" : "Selecionar página"}
          </button>
        )}
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
        {itens.map((d) => (
          <DemandaLinha key={d.id} d={d} selecionavel={podeEditar} selecionada={selecionadas.has(d.id)} onSelecionar={() => alternar(d.id)} />
        ))}
        {!dados && <div className="p-12 text-center text-sm text-slate-500">Carregando…</div>}
        {dados && itens.length === 0 && (
          <div className="p-12 text-center text-sm text-slate-500">
            {temFiltro ? "Nenhuma demanda neste recorte. Ajuste os filtros ou limpe-os." : "Nenhuma demanda cadastrada ainda."}
          </div>
        )}
      </section>

      {nova && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4">
          <form onSubmit={criar} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex justify-between">
              <div>
                <h2 className="text-lg font-bold">Nova demanda</h2>
                <p className="mt-1 text-sm text-slate-500">Comece pelo que foi solicitado; os detalhes podem ser registrados depois.</p>
              </div>
              <button type="button" onClick={() => setNova(false)}><X className="h-5 w-5" /></button>
            </div>
            <input autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)} className="mt-5 w-full rounded-lg border border-slate-300 px-3 py-3 text-sm" placeholder="Ex.: Aquisição de ambulância" />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setNova(false)} className="rounded-lg px-4 py-2 text-sm">Cancelar</button>
              <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Criar demanda</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function DemandaLinha({ d, selecionavel, selecionada, onSelecionar }: {
  d: DemandaV2; selecionavel: boolean; selecionada: boolean; onSelecionar: () => void;
}) {
  return (
    <div className={`group flex flex-col gap-3 p-5 sm:flex-row sm:items-center ${selecionada ? "bg-blue-50/60" : "hover:bg-slate-50"}`}>
      {selecionavel && (
        <input type="checkbox" checked={selecionada} onChange={onSelecionar} aria-label={`Selecionar demanda ${d.numero}`} className="h-4 w-4 shrink-0" />
      )}
      <Link href={`/demandas/${d.id}`} className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex gap-2">
            <span className="font-mono text-xs text-slate-500">{d.numero}</span>
            {d.atrasada && <span className="text-xs font-semibold text-red-700">Atrasada</span>}
          </div>
          <p className="mt-1 truncate font-semibold text-slate-900 group-hover:text-blue-700">{d.titulo}</p>
          <p className="mt-1 text-xs text-slate-500">{d.setor_atual?.nome || "Sem setor"} · {d.responsavel_geral?.name || "Sem responsável"}</p>
        </div>
        <div className="flex items-center gap-5">
          <div className="hidden w-28 sm:block">
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-blue-600" style={{ width: `${d.progresso}%` }} /></div>
            <p className="mt-1 text-xs text-slate-500">{d.progresso}% concluído</p>
          </div>
          <div className="min-w-28 text-right">
            <p className="text-sm font-medium text-slate-700">{d.status?.rotulo || "Aberta"}</p>
            <p className={`mt-1 text-xs ${d.atrasada ? "text-red-700" : "text-slate-500"}`}>{d.prazo_final ? `Prazo: ${formatDate(d.prazo_final)}` : "Sem prazo"}</p>
          </div>
        </div>
      </Link>
    </div>
  );
}
