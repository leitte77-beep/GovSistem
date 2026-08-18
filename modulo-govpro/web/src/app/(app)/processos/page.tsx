"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { ProcessoOut, TipoProcesso } from "@/types/govpro";
import { formatDateTime } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import { NivelAcessoBadge, SituacaoBadge } from "@/components/processo/badges";

const SITUACAO_OPTIONS = [
  { value: "", label: "Todas as situações" },
  { value: "EM_TRAMITACAO", label: "Aberto" },
  { value: "SOBRESTADO", label: "Sobrestado" },
  { value: "ENCERRADO", label: "Concluído" },
  { value: "ARQUIVADO", label: "Arquivado" },
];

const NIVEL_OPTIONS = [
  { value: "", label: "Todos os níveis" },
  { value: "PUBLICO", label: "Público" },
  { value: "RESTRITO", label: "Restrito" },
  { value: "SIGILOSO", label: "Sigiloso" },
];

interface Filtros {
  q: string;
  tipoProcessoId: string;
  situacao: string;
  nivelAcesso: string;
  dataInicio: string;
  dataFim: string;
}

const FILTROS_VAZIOS: Filtros = {
  q: "",
  tipoProcessoId: "",
  situacao: "",
  nivelAcesso: "",
  dataInicio: "",
  dataFim: "",
};

export default function ProcessosPage() {
  const [processos, setProcessos] = useState<ProcessoOut[]>([]);
  const [tipos, setTipos] = useState<TipoProcesso[]>([]);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [loading, setLoading] = useState(true);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    api.listTiposProcesso().then(setTipos).catch(() => {});
  }, []);

  const carregar = (f: Filtros, primeiraVez = false) => {
    setLoading(primeiraVez);
    setBuscando(!primeiraVez);
    api
      .listProcessos({
        q: f.q.trim() || undefined,
        tipo_processo_id: f.tipoProcessoId || undefined,
        situacao: f.situacao || undefined,
        nivel_acesso: f.nivelAcesso || undefined,
        data_inicio: f.dataInicio ? new Date(f.dataInicio).toISOString() : undefined,
        data_fim: f.dataFim ? new Date(f.dataFim).toISOString() : undefined,
        limit: 50,
      })
      .then(setProcessos)
      .catch(() => setProcessos([]))
      .finally(() => {
        setLoading(false);
        setBuscando(false);
      });
  };

  useEffect(() => {
    carregar(FILTROS_VAZIOS, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    carregar(filtros);
  };

  const limpar = () => {
    setFiltros(FILTROS_VAZIOS);
    carregar(FILTROS_VAZIOS);
  };

  const filtrosAtivos = Object.entries(filtros).filter(([, v]) => v !== "").length;

  return (
    <div className="pb-stack-lg">
      <PageHeader
        title="Processos"
        subtitle="Busque e filtre os processos do órgão."
        actions={
          <Link
            href="/processos/novo"
            className="inline-flex items-center gap-2 h-11 px-4 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">add_circle</span>
            Iniciar Processo
          </Link>
        }
      />

      <div className="px-gutter max-w-container-max mx-auto">
        <form onSubmit={onSubmit} className="mb-6" role="search">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline" aria-hidden="true">
                search
              </span>
              <input
                type="search"
                value={filtros.q}
                onChange={(e) => setFiltros((f) => ({ ...f, q: e.target.value }))}
                placeholder="Buscar por NUP ou especificação…"
                className="w-full h-12 pl-12 pr-4 bg-surface-container-lowest border border-outline-variant rounded-lg focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                aria-label="Buscar processo"
              />
            </div>
            <button
              type="button"
              onClick={() => setFiltrosAbertos((v) => !v)}
              aria-expanded={filtrosAbertos}
              className="inline-flex items-center gap-2 h-12 px-4 border border-outline-variant text-on-surface rounded-lg hover:bg-surface-container-high transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">tune</span>
              Filtros
              {filtrosAtivos > 0 && (
                <span className="w-5 h-5 flex items-center justify-center text-[11px] bg-primary text-on-primary rounded-full">
                  {filtrosAtivos}
                </span>
              )}
            </button>
            <button
              type="submit"
              disabled={buscando}
              className="h-12 px-5 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors disabled:opacity-60"
            >
              Buscar
            </button>
          </div>

          {filtrosAbertos && (
            <div className="mt-3 bg-surface-container-lowest border border-outline-variant rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-label-md font-label-md text-on-surface">Tipo de processo</label>
                <select
                  value={filtros.tipoProcessoId}
                  onChange={(e) => setFiltros((f) => ({ ...f, tipoProcessoId: e.target.value }))}
                  className="w-full h-11 px-3 mt-1 bg-surface-container-low border border-outline-variant rounded-lg"
                >
                  <option value="">Todos os tipos</option>
                  {tipos.map((t) => (
                    <option key={t.id} value={t.id}>{t.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-label-md font-label-md text-on-surface">Situação</label>
                <select
                  value={filtros.situacao}
                  onChange={(e) => setFiltros((f) => ({ ...f, situacao: e.target.value }))}
                  className="w-full h-11 px-3 mt-1 bg-surface-container-low border border-outline-variant rounded-lg"
                >
                  {SITUACAO_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-label-md font-label-md text-on-surface">Nível de acesso</label>
                <select
                  value={filtros.nivelAcesso}
                  onChange={(e) => setFiltros((f) => ({ ...f, nivelAcesso: e.target.value }))}
                  className="w-full h-11 px-3 mt-1 bg-surface-container-low border border-outline-variant rounded-lg"
                >
                  {NIVEL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-label-md font-label-md text-on-surface">Gerado de</label>
                  <input
                    type="date"
                    value={filtros.dataInicio}
                    onChange={(e) => setFiltros((f) => ({ ...f, dataInicio: e.target.value }))}
                    className="w-full h-11 px-2 mt-1 bg-surface-container-low border border-outline-variant rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-label-md font-label-md text-on-surface">até</label>
                  <input
                    type="date"
                    value={filtros.dataFim}
                    onChange={(e) => setFiltros((f) => ({ ...f, dataFim: e.target.value }))}
                    className="w-full h-11 px-2 mt-1 bg-surface-container-low border border-outline-variant rounded-lg"
                  />
                </div>
              </div>
              <div className="sm:col-span-2 lg:col-span-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={limpar}
                  className="h-10 px-4 text-label-md font-label-md text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors"
                >
                  Limpar filtros
                </button>
                <button
                  type="submit"
                  className="h-10 px-4 text-label-md font-label-md bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors"
                >
                  Aplicar
                </button>
              </div>
            </div>
          )}
        </form>

        {loading ? (
          <div className="text-center py-16 text-on-surface-variant">Carregando…</div>
        ) : processos.length === 0 ? (
          <EmptyState
            icon="folder_open"
            title="Nenhum processo encontrado"
            description="Ajuste a busca ou os filtros, ou inicie um novo processo."
          />
        ) : (
          <div className="bg-surface-container-lowest rounded-lg border border-outline-variant overflow-hidden overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-surface-container-high">
                <tr className="text-label-md font-label-md text-on-surface-variant">
                  <th className="px-4 py-3">NUP</th>
                  <th className="px-4 py-3">Especificação</th>
                  <th className="px-4 py-3">Acesso</th>
                  <th className="px-4 py-3">Situação</th>
                  <th className="px-4 py-3">Início</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {processos.map((p) => (
                  <tr key={p.id} className="hover:bg-surface-container-low transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/processos/${p.id}`} className="font-mono text-body-sm text-primary hover:underline">
                        {p.nup}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-body-md text-on-surface max-w-md truncate">{p.especificacao}</td>
                    <td className="px-4 py-3"><NivelAcessoBadge nivel={p.nivel_acesso} /></td>
                    <td className="px-4 py-3"><SituacaoBadge situacao={p.situacao} /></td>
                    <td className="px-4 py-3 text-body-sm text-on-surface-variant">{formatDateTime(p.data_autuacao)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
