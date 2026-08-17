"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import type { Feriado } from "@/types/govpro";
import { formatDate } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import ConfirmModal from "@/components/ConfirmModal";
import Badge from "@/components/Badge";

export default function FeriadosPage() {
  const [feriados, setFeriados] = useState<Feriado[]>([]);
  const [ano, setAno] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [data, setData] = useState("");
  const [nome, setNome] = useState("");
  const [escopo, setEscopo] = useState("MUNICIPAL");
  const [submitting, setSubmitting] = useState(false);

  const [removendo, setRemovendo] = useState<Feriado | null>(null);

  const carregar = useCallback((a: number) => {
    setLoading(true);
    api
      .listFeriados(a)
      .then(setFeriados)
      .catch(() => setFeriados([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    carregar(ano);
  }, [ano, carregar]);

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.criarFeriado({ data, nome, escopo });
      toast.success("Feriado adicionado");
      setShowForm(false);
      setData("");
      setNome("");
      carregar(ano);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao adicionar feriado");
    } finally {
      setSubmitting(false);
    }
  };

  const remover = async () => {
    if (!removendo) return;
    setSubmitting(true);
    try {
      await api.removerFeriado(removendo.data);
      toast.success("Feriado removido");
      setRemovendo(null);
      carregar(ano);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover feriado");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pb-stack-lg">
      <PageHeader
        title="Feriados"
        subtitle="Calendário de feriados e pontos facultativos usados no cálculo de prazos."
        actions={
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-2 h-11 px-4 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">add</span>
            Adicionar feriado
          </button>
        }
      />

      <div className="px-gutter max-w-container-max mx-auto space-y-stack-md">
        <div className="flex items-center gap-3">
          <label htmlFor="ano" className="text-label-md font-label-md">Ano</label>
          <select
            id="ano"
            value={ano}
            onChange={(e) => setAno(Number(e.target.value))}
            className="h-11 px-3 bg-surface-container-lowest border border-outline-variant rounded-lg"
          >
            {[ano - 1, ano, ano + 1].map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        {showForm && (
          <form onSubmit={criar} className="bg-surface-container-lowest rounded-lg border border-outline-variant p-6 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="text-label-md font-label-md">Data</label>
              <input
                type="date"
                required
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="w-full h-12 px-3 bg-surface-container-low border border-outline-variant rounded-lg mt-1"
              />
            </div>
            <div>
              <label className="text-label-md font-label-md">Nome</label>
              <input
                required
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full h-12 px-3 bg-surface-container-low border border-outline-variant rounded-lg mt-1"
              />
            </div>
            <div>
              <label className="text-label-md font-label-md">Escopo</label>
              <select
                value={escopo}
                onChange={(e) => setEscopo(e.target.value)}
                className="w-full h-12 px-3 bg-surface-container-low border border-outline-variant rounded-lg mt-1"
              >
                <option value="NACIONAL">Nacional</option>
                <option value="ESTADUAL">Estadual</option>
                <option value="MUNICIPAL">Municipal</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="h-12 px-5 bg-primary text-on-primary rounded-lg hover:bg-primary-container transition-colors disabled:opacity-60"
            >
              Salvar
            </button>
          </form>
        )}

        {loading ? (
          <div className="text-center py-16 text-on-surface-variant">Carregando…</div>
        ) : feriados.length === 0 ? (
          <EmptyState icon="calendar_month" title="Nenhum feriado neste ano" />
        ) : (
          <div className="bg-surface-container-lowest rounded-lg border border-outline-variant overflow-hidden">
            <ul className="divide-y divide-outline-variant">
              {feriados.map((f) => (
                <li key={f.data} className="px-5 py-3 flex items-center gap-3">
                  <div className="flex-1">
                    <div className="text-body-md text-on-surface">{f.nome}</div>
                    <div className="text-body-sm text-on-surface-variant">{formatDate(f.data)}</div>
                  </div>
                  <Badge tone="neutral">{f.escopo}</Badge>
                  <button
                    onClick={() => setRemovendo(f)}
                    aria-label={`Remover ${f.nome}`}
                    className="w-10 h-10 flex items-center justify-center text-error hover:bg-error-container rounded-lg transition-colors"
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">delete</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <ConfirmModal
        open={removendo !== null}
        title="Remover feriado"
        message={`Remover "${removendo?.nome}" (${removendo ? formatDate(removendo.data) : ""})?`}
        danger
        loading={submitting}
        onConfirm={remover}
        onCancel={() => setRemovendo(null)}
      />
    </div>
  );
}
