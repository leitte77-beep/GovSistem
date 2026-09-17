"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Filter, Plus, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PERM } from "@/lib/perfil";
import { notify } from "@/components/ui/Toast";
import { NovaDemandaWizard } from "@/components/demandas/NovaDemandaWizard";
import { VisoesBar } from "@/components/demandas/VisoesBar";
import { formatDate } from "@/lib/utils";
import type { DemandaV2, DemandaV2Page } from "@/types/govtask";

/** Colunas disponíveis no modo lista técnica (§53). */
const COLUNAS_DISPONIVEIS: [string, string][] = [
  ["numero", "Número"],
  ["titulo", "Título"],
  ["status", "Situação"],
  ["tipo", "Tipo"],
  ["prioridade", "Prioridade"],
  ["setor_atual", "Setor"],
  ["responsavel_atual", "Responsável"],
  ["progresso", "Progresso"],
  ["prazo_final", "Prazo"],
  ["ultima_movimentacao_em", "Movimentação"],
];

function valorColuna(d: DemandaV2, chave: string): ReactNode {
  switch (chave) {
    case "numero":
      return <Link href={`/demandas/${d.id}`} className="font-mono text-xs text-blue-700 hover:underline">{d.numero}</Link>;
    case "titulo":
      return d.titulo;
    case "status":
      return d.status?.rotulo ?? "—";
    case "tipo":
      return d.tipo?.rotulo ?? "—";
    case "prioridade":
      return d.prioridade;
    case "setor_atual":
      return d.setor_atual?.nome ?? "—";
    case "responsavel_atual":
      return d.responsavel_atual?.name ?? "—";
    case "progresso":
      return `${d.progresso}%`;
    case "prazo_final":
      return d.prazo_final ? formatDate(d.prazo_final) : "—";
    case "ultima_movimentacao_em":
      return formatDate(d.ultima_movimentacao_em);
    default:
      return "—";
  }
}

/**
 * Listagem de demandas com visões salvas, filtros rápidos e ações em lote
 * (§49, §50, §188, §189).
 *
 * As ações em lote exigem motivo e passam pela mesma autorização da operação
 * individual: o que o usuário não pode abrir, não entra no lote.
 */
export default function DemandasPage() {
  const { hasPermission } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const podeEditar = hasPermission(PERM.EDIT, PERM.ADMIN);
  const [dados, setDados] = useState<DemandaV2Page>();
  const [filtros, setFiltros] = useState<Record<string, unknown>>({});
  const [tipos, setTipos] = useState<{ id: string; rotulo: string }[]>([]);
  const [nova, setNova] = useState(false);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [usuarios, setUsuarios] = useState<{ id: string; name: string }[]>([]);
  const [prioridade, setPrioridade] = useState("ALTA");
  const [responsavel, setResponsavel] = useState("");
  const [tag, setTag] = useState("");
  const [processando, setProcessando] = useState(false);
  const [modo, setModo] = useState<"cards" | "tabela">("cards");
  const [colunas, setColunas] = useState<string[]>(["numero", "titulo", "status", "setor_atual", "prazo_final"]);

  // Preferência de exibição (§53): não é dado oficial, então fica no navegador.
  useEffect(() => {
    try {
      const modoSalvo = localStorage.getItem("govtask:demandas:modo");
      if (modoSalvo === "tabela" || modoSalvo === "cards") setModo(modoSalvo);
      const colunasSalvas = localStorage.getItem("govtask:demandas:colunas");
      if (colunasSalvas) {
        const parsed = JSON.parse(colunasSalvas);
        if (Array.isArray(parsed) && parsed.every((c) => typeof c === "string")) setColunas(parsed);
      }
    } catch {
      /* preferência corrompida não impede a tela */
    }
  }, []);

  const mudarModo = (novo: "cards" | "tabela") => {
    setModo(novo);
    try { localStorage.setItem("govtask:demandas:modo", novo); } catch { /* ignore */ }
  };

  const alternarColuna = (chave: string) =>
    setColunas((prev) => {
      const novo = prev.includes(chave) ? prev.filter((c) => c !== chave) : [...prev, chave];
      try { localStorage.setItem("govtask:demandas:colunas", JSON.stringify(novo)); } catch { /* ignore */ }
      return novo;
    });

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

  // Atalho "N" (§219): abre o formulário e limpa o parâmetro da URL.
  useEffect(() => {
    if (searchParams.get("nova") === "1") {
      setNova(true);
      router.replace("/demandas");
    }
  }, [searchParams, router]);

  useEffect(() => {
    if (podeEditar) api.listUsers().then(setUsuarios).catch(() => setUsuarios([]));
  }, [podeEditar]);

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
          <div className="flex items-center gap-2 sm:ml-auto">
            <div className="flex rounded-lg border border-slate-300" role="group" aria-label="Modo de exibição">
              <button onClick={() => mudarModo("cards")} aria-pressed={modo === "cards"} className={`px-3 py-1.5 text-xs font-semibold ${modo === "cards" ? "bg-slate-900 text-white" : "text-slate-600"}`}>Cards</button>
              <button onClick={() => mudarModo("tabela")} aria-pressed={modo === "tabela"} className={`px-3 py-1.5 text-xs font-semibold ${modo === "tabela" ? "bg-slate-900 text-white" : "text-slate-600"}`}>Tabela</button>
            </div>
            {modo === "tabela" && (
              <details className="relative">
                <summary className="cursor-pointer list-none rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">Colunas</summary>
                <div className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
                  {COLUNAS_DISPONIVEIS.map(([chave, rotulo]) => (
                    <label key={chave} className="flex items-center gap-2 py-0.5 text-xs text-slate-700">
                      <input type="checkbox" checked={colunas.includes(chave)} onChange={() => alternarColuna(chave)} />
                      {rotulo}
                    </label>
                  ))}
                </div>
              </details>
            )}
          </div>
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

      {modo === "tabela" ? (
        <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <caption className="sr-only">Lista de demandas</caption>
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {podeEditar && <th className="p-3"><span className="sr-only">Selecionar</span></th>}
                {colunas.map((chave) => (
                  <th key={chave} scope="col" className="whitespace-nowrap p-3">
                    {COLUNAS_DISPONIVEIS.find(([k]) => k === chave)?.[1] ?? chave}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {itens.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50">
                  {podeEditar && (
                    <td className="p-3">
                      <input type="checkbox" checked={selecionadas.has(d.id)} onChange={() => alternar(d.id)} aria-label={`Selecionar demanda ${d.numero}`} />
                    </td>
                  )}
                  {colunas.map((chave) => (
                    <td key={chave} className="whitespace-nowrap p-3 text-slate-700">{valorColuna(d, chave)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!dados && <div className="p-12 text-center text-sm text-slate-500">Carregando…</div>}
          {dados && itens.length === 0 && <div className="p-12 text-center text-sm text-slate-500">Nenhuma demanda neste recorte.</div>}
        </section>
      ) : (
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
      )}

      <NovaDemandaWizard
        aberto={nova}
        onFechar={() => setNova(false)}
        onCriada={(d) => {
          setNova(false);
          router.push(`/demandas/${d.id}`);
        }}
      />
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
