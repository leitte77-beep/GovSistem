"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Columns3, List, Lock, Network, Search } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PERM } from "@/lib/perfil";
import { notify } from "@/components/ui/Toast";
import type { DemandaV2 } from "@/types/govtask";
import { formatDate } from "@/lib/utils";

type Modo = "kanban" | "lista" | "agenda" | "dependencias";
type Coluna = { id: string; nome: string; cor?: string | null; final: boolean };

export default function OperacaoPage() {
  const { hasPermission } = useAuth();
  const podeEditar = hasPermission(PERM.EDIT, PERM.ADMIN);
  const [itens, setItens] = useState<DemandaV2[]>([]);
  const [status, setStatus] = useState<Coluna[]>([]);
  const [modo, setModo] = useState<Modo>("kanban");
  const [q, setQ] = useState("");
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);

  useEffect(() => {
    api.listDemandasV2({ q, page_size: 100 }).then((x) => setItens(x.items));
  }, [q]);

  useEffect(() => {
    api
      .catalogosDemandas()
      .then((c) =>
        setStatus(
          c.status.map((s) => ({
            id: s.id,
            nome: s.rotulo,
            cor: s.cor,
            final: Boolean(s.is_final),
          }))
        )
      )
      .catch(() => setStatus([]));
  }, []);

  const grupos = useMemo(() => {
    const g: Record<string, DemandaV2[]> = { Abertas: [], "Em andamento": [], Aguardando: [], Concluídas: [] };
    itens.forEach((d) => {
      const s = (d.status?.rotulo || "").toLowerCase();
      g[s.includes("concl") ? "Concluídas" : s.includes("aguard") ? "Aguardando" : d.progresso > 0 ? "Em andamento" : "Abertas"].push(d);
    });
    return g;
  }, [itens]);

  const porStatus = useMemo(() => {
    const mapa: Record<string, DemandaV2[]> = {};
    for (const coluna of status) mapa[coluna.id] = [];
    for (const demanda of itens) {
      const chave = demanda.status?.id;
      if (chave && mapa[chave]) mapa[chave].push(demanda);
      else if (chave) mapa[chave] = [demanda];
    }
    return mapa;
  }, [itens, status]);

  const mover = async (demandaId: string, destino: Coluna) => {
    const demanda = itens.find((d) => d.id === demandaId);
    if (!demanda || demanda.status?.id === destino.id) return;
    if (!podeEditar) return notify.error("Você não tem permissão para alterar a situação");
    if (destino.final) return notify.error("Para encerrar, use Concluir/Cancelar na demanda");
    try {
      const atualizada = await api.alterarStatusDemanda(demandaId, destino.id);
      setItens((prev) =>
        prev.map((d) =>
          d.id === demandaId
            ? { ...d, status: atualizada.status, progresso: atualizada.progresso, atrasada: atualizada.atrasada }
            : d
        )
      );
      notify.success(`Demanda movida para ${destino.nome}`);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível mover a demanda");
    }
  };

  const soltar = async (coluna: Coluna) => {
    const id = arrastando;
    setSobre(null);
    setArrastando(null);
    if (!id || coluna.final) return;
    await mover(id, coluna);
  };

  const botoes: [Modo, string, typeof Columns3][] = [
    ["kanban", "Kanban", Columns3],
    ["lista", "Lista", List],
    ["agenda", "Agenda", CalendarDays],
    ["dependencias", "Dependências", Network],
  ];

  return (
    <div className="max-w-7xl space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[.14em] text-blue-700">Controle de fluxo</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">Mesa operacional</h1>
        <p className="mt-1 text-sm text-slate-600">A mesma demanda vista pelo estágio, prazo ou relação de dependência.</p>
      </header>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row">
        <label className="flex flex-1 items-center gap-2 rounded-lg bg-slate-50 px-3">
          <Search className="h-4 w-4 text-slate-400" aria-hidden="true" />
          <span className="sr-only">Filtrar demandas</span>
          <input className="h-9 w-full bg-transparent text-sm outline-none" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar demandas" />
        </label>
        <div className="flex gap-1 overflow-auto" role="tablist" aria-label="Modos de visualização">
          {botoes.map(([key, label, Icon]) => (
            <button
              key={key}
              role="tab"
              aria-selected={modo === key}
              onClick={() => setModo(key)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold ${modo === key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {modo === "kanban" && status.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-4">
          {status.map((coluna) => (
            <section
              key={coluna.id}
              onDragOver={(e) => {
                if (coluna.final) return;
                e.preventDefault();
                setSobre(coluna.id);
              }}
              onDragLeave={() => setSobre((atual) => (atual === coluna.id ? null : atual))}
              onDrop={() => void soltar(coluna)}
              className={`min-h-64 rounded-xl p-3 ${sobre === coluna.id ? "bg-blue-50 ring-2 ring-blue-300" : "bg-slate-100"}`}
              aria-label={`Coluna ${coluna.nome}`}
            >
              <div className="mb-3 flex items-center justify-between px-1">
                <h2 className="flex items-center gap-1 text-sm font-bold text-slate-700">
                  {coluna.final && <Lock className="h-3.5 w-3.5 text-slate-400" aria-label="Coluna de encerramento" />}
                  {coluna.nome}
                </h2>
                <span className="text-xs text-slate-500">{(porStatus[coluna.id] ?? []).length}</span>
              </div>
              <div className="space-y-3">
                {(porStatus[coluna.id] ?? []).map((d) => (
                  <Card
                    key={d.id}
                    d={d}
                    colunas={status}
                    podeEditar={podeEditar}
                    onMover={(destinoId) => {
                      const destino = status.find((s) => s.id === destinoId);
                      if (destino) void mover(d.id, destino);
                    }}
                    onDragStart={() => setArrastando(d.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {modo === "lista" && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
          {itens.map((d) => <Card key={d.id} d={d} linha />)}
        </section>
      )}

      {modo === "agenda" && (
        <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {itens.filter((d) => d.prazo_final).sort((a, b) => (a.prazo_final || "").localeCompare(b.prazo_final || "")).map((d) => <Card key={d.id} d={d} />)}
        </section>
      )}

      {modo === "dependencias" && (
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-bold text-slate-900">Mapa de dependências</h2>
          <p className="mt-1 text-sm text-slate-600">Abra uma demanda para visualizar tarefas, subtarefas e bloqueios. As ligações são mantidas na tarefa para não esconder a causa real de uma espera.</p>
          <div className="mt-6 space-y-3">
            {itens.slice(0, 12).map((d, i) => (
              <Link className="flex items-center gap-3 rounded-lg border border-slate-200 p-4 hover:border-blue-400" key={d.id} href={`/demandas/${d.id}`}>
                <span className="grid h-7 w-7 place-items-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">{i + 1}</span>
                <div>
                  <p className="font-semibold text-slate-800">{d.titulo}</p>
                  <p className="text-xs text-slate-500">{d.proxima_acao || "Sem próxima ação"}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Card({ d, linha, colunas, podeEditar, onMover, onDragStart }: {
  d: DemandaV2;
  linha?: boolean;
  colunas?: Coluna[];
  podeEditar?: boolean;
  onMover?: (destinoId: string) => void;
  onDragStart?: () => void;
}) {
  const arrastavel = Boolean(onDragStart) && Boolean(podeEditar);
  return (
    <div
      draggable={arrastavel}
      onDragStart={arrastavel ? onDragStart : undefined}
      className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-400 hover:shadow ${linha ? "rounded-none border-x-0 border-t-0 shadow-none" : ""} ${arrastavel ? "cursor-grab" : ""}`}
    >
      <Link href={`/demandas/${d.id}`} className="block focus:outline-none focus:ring-2 focus:ring-blue-500">
        <div className="flex justify-between gap-2">
          <span className="font-mono text-[11px] text-slate-500">{d.numero}</span>
          {d.atrasada && <span className="text-[11px] font-bold text-red-700">ATRASADA</span>}
        </div>
        <p className="mt-2 text-sm font-semibold text-slate-800">{d.titulo}</p>
        <p className="mt-2 text-xs text-slate-500">{d.setor_atual?.nome || "Sem setor"} · {d.progresso}%</p>
        {d.prazo_final && <p className="mt-2 text-xs text-slate-600">Prazo: {formatDate(d.prazo_final)}</p>}
      </Link>
      {colunas && podeEditar && onMover && (
        <label className="mt-2 block">
          <span className="sr-only">Mover {d.titulo} para outra situação</span>
          <select
            value={d.status?.id ?? ""}
            onChange={(e) => onMover(e.target.value)}
            className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600"
          >
            {colunas.map((c) => (
              <option key={c.id} value={c.id} disabled={c.final}>
                {c.nome}{c.final ? " (encerra)" : ""}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
