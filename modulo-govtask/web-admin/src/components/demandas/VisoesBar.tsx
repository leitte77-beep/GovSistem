"use client";

/**
 * Visões salvas da listagem de demandas (§49, §50).
 *
 * A visão guarda filtros, nunca resultados: aplicá-la é reescrever o recorte da
 * consulta, e o servidor reavalia o escopo de visibilidade a cada abertura.
 * Por isso uma visão compartilhada nunca revela a quem não poderia ver.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Bookmark, Check, Plus, Star, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { notify } from "@/components/ui/Toast";
import type { VisaoSalva } from "@/types/govtask";

type Props = {
  filtrosAtuais: Record<string, unknown>;
  onAplicar: (filtros: Record<string, unknown>) => void;
  recurso?: string;
  layout?: string;
};

/** Remove chaves vazias: uma visão não deve guardar `prioridade: ""`. */
function limpar(filtros: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(filtros).filter(
      ([, v]) => v !== "" && v !== null && v !== undefined && v !== false
    )
  );
}

export function VisoesBar({ filtrosAtuais, onAplicar, recurso = "DEMANDAS", layout = "LISTA" }: Props) {
  const [visoes, setVisoes] = useState<VisaoSalva[]>([]);
  const [ativaId, setAtivaId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [formAberto, setFormAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [compartilhada, setCompartilhada] = useState(false);
  const padraoAplicado = useRef(false);

  const carregar = useCallback(async () => {
    try {
      setVisoes(await api.listarVisoes(recurso));
    } catch {
      setVisoes([]);
    }
  }, [recurso]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Abre na visão padrão quando o usuário tem uma. Só uma vez, para não
  // desfazer o ajuste manual de quem começa a mexer no recorte logo depois.
  useEffect(() => {
    if (padraoAplicado.current || !visoes.length) return;
    const padrao = visoes.find((v) => v.padrao);
    if (padrao) {
      padraoAplicado.current = true;
      setAtivaId(padrao.id);
      onAplicar(padrao.filtros);
    }
  }, [visoes, onAplicar]);

  const aplicar = (v: VisaoSalva) => {
    setAtivaId(v.id);
    onAplicar(v.filtros);
  };

  const salvar = async () => {
    if (nome.trim().length < 2) return notify.error("Dê um nome à visão");
    setSalvando(true);
    try {
      const criada = await api.salvarVisao({
        nome: nome.trim(),
        filtros: limpar(filtrosAtuais),
        recurso,
        layout,
        compartilhada,
      });
      setNome("");
      setCompartilhada(false);
      setFormAberto(false);
      await carregar();
      setAtivaId(criada.id);
      notify.success("Visão salva");
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível salvar a visão");
    } finally {
      setSalvando(false);
    }
  };

  const definirPadrao = async (v: VisaoSalva) => {
    try {
      await api.editarVisao(v.id, { padrao: true });
      await carregar();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível definir como padrão");
    }
  };

  const remover = async (v: VisaoSalva) => {
    if (!window.confirm(`Remover a visão "${v.nome}"?`)) return;
    try {
      await api.excluirVisao(v.id);
      if (ativaId === v.id) setAtivaId(null);
      await carregar();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Não foi possível remover a visão");
    }
  };

  return (
    <section aria-label="Visões salvas" className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
          <Bookmark className="h-3.5 w-3.5" /> Visões
        </span>
        {visoes.map((v) => (
          <span
            key={v.id}
            className={`group inline-flex items-center gap-1 rounded-full pl-3 pr-1.5 text-xs font-semibold ring-1 ${
              ativaId === v.id
                ? "bg-blue-700 text-white ring-blue-700"
                : "bg-slate-50 text-slate-700 ring-slate-200 hover:bg-slate-100"
            }`}
          >
            <button
              onClick={() => aplicar(v)}
              title={v.compartilhada ? "Visão compartilhada" : "Visão pessoal"}
              className="py-1.5"
            >
              {v.padrao && <Star className="mr-1 inline h-3 w-3 fill-current" aria-label="Visão padrão" />}
              {v.nome}
              {v.compartilhada && <span className="ml-1 opacity-70">· equipe</span>}
            </button>
            {v.minha && (
              <>
                {!v.padrao && (
                  <button onClick={() => definirPadrao(v)} title="Definir como padrão" aria-label={`Definir ${v.nome} como padrão`} className="rounded-full p-1 opacity-0 transition group-hover:opacity-100 hover:bg-black/10">
                    <Star className="h-3 w-3" />
                  </button>
                )}
                <button onClick={() => remover(v)} title="Remover visão" aria-label={`Remover visão ${v.nome}`} className="rounded-full p-1 opacity-0 transition group-hover:opacity-100 hover:bg-black/10">
                  <Trash2 className="h-3 w-3" />
                </button>
              </>
            )}
          </span>
        ))}
        {!formAberto ? (
          <button onClick={() => setFormAberto(true)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-blue-400 hover:text-blue-700">
            <Plus className="h-3.5 w-3.5" /> Salvar recorte atual
          </button>
        ) : (
          <span className="inline-flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5">
            <input
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && salvar()}
              placeholder="Ex.: Aquisições urgentes 2026"
              aria-label="Nome da visão"
              className="h-8 w-56 rounded-lg border border-slate-300 px-2 text-xs"
            />
            <label className="flex items-center gap-1 text-xs text-slate-600">
              <input type="checkbox" checked={compartilhada} onChange={(e) => setCompartilhada(e.target.checked)} className="h-3.5 w-3.5" />
              Compartilhar com a equipe
            </label>
            <button onClick={salvar} disabled={salvando} className="inline-flex items-center gap-1 rounded-lg bg-blue-700 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              <Check className="h-3.5 w-3.5" /> Salvar
            </button>
            <button onClick={() => setFormAberto(false)} aria-label="Cancelar" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200">
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
      </div>
    </section>
  );
}
