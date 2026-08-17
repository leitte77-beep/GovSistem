"use client";

import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import type { MinhaIntimacao } from "@/types/public";
import { formatDateTime, STATUS_INTIMACAO_LABEL } from "@/lib/format";
import EmptyState from "@/components/EmptyState";
import Badge from "@/components/Badge";

export default function IntimacoesPage() {
  const [itens, setItens] = useState<MinhaIntimacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [dandoCiencia, setDandoCiencia] = useState<string | null>(null);

  const carregar = useCallback(() => {
    api
      .minhasIntimacoes()
      .then(setItens)
      .catch(() => setItens([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(carregar, [carregar]);

  const darCiencia = async (id: string) => {
    setDandoCiencia(id);
    try {
      await api.darCiencia(id);
      toast.success("Ciência registrada");
      carregar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao registrar ciência");
    } finally {
      setDandoCiencia(null);
    }
  };

  if (loading) {
    return <div className="text-center py-16 text-on-surface-variant">Carregando…</div>;
  }

  return (
    <div>
      <h1 className="text-headline-md font-headline-md mb-4">Intimações</h1>
      {itens.length === 0 ? (
        <EmptyState icon="notifications" title="Nenhuma intimação" description="Você não tem intimações no momento." />
      ) : (
        <ul className="space-y-3">
          {itens.map((i) => (
            <li key={i.id} className="bg-surface-container-lowest rounded-lg border border-outline-variant p-4">
              <div className="flex items-center gap-2 justify-between">
                <Badge tone="neutral">{STATUS_INTIMACAO_LABEL[i.status] || i.status}</Badge>
                <span className="text-body-sm text-on-surface-variant">
                  {formatDateTime(i.disponibilizada_em)} · {i.prazo_dias} dias
                </span>
              </div>
              <p className="mt-3 text-body-md text-on-surface">{i.texto}</p>
              {i.status === "DISPONIBILIZADA" && (
                <button
                  onClick={() => darCiencia(i.id)}
                  disabled={dandoCiencia === i.id}
                  className="mt-4 h-10 px-4 bg-secondary text-on-secondary rounded-lg hover:opacity-90 transition-colors disabled:opacity-60 text-label-md font-label-md"
                >
                  {dandoCiencia === i.id ? "Registrando…" : "Registrar ciência"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
