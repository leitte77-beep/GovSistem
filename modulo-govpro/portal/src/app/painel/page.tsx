"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { MeuProcesso } from "@/types/public";
import { formatDateTime, STATUS_PETICIONAMENTO_LABEL } from "@/lib/format";
import EmptyState from "@/components/EmptyState";
import Badge from "@/components/Badge";

export default function MeusProcessosPage() {
  const [itens, setItens] = useState<MeuProcesso[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .meusProcessos()
      .then(setItens)
      .catch(() => setItens([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-center py-16 text-on-surface-variant">Carregando…</div>;
  }

  if (itens.length === 0) {
    return (
      <EmptyState
        icon="folder_open"
        title="Nenhum processo ainda"
        description="Quando você peticionar, seus requerimentos aparecerão aqui."
      />
    );
  }

  return (
    <div>
      <h1 className="text-headline-md font-headline-md mb-4">Meus processos</h1>
      <ul className="space-y-3">
        {itens.map((p) => (
          <li key={p.id} className="bg-surface-container-lowest rounded-lg border border-outline-variant p-4">
            <div className="flex flex-wrap items-center gap-2 justify-between">
              {p.nup ? (
                <span className="font-mono text-body-sm text-primary">{p.nup}</span>
              ) : (
                <span className="text-body-sm text-on-surface-variant">Protocolo em processamento</span>
              )}
              <Badge tone="neutral">{STATUS_PETICIONAMENTO_LABEL[p.status] || p.status}</Badge>
            </div>
            <p className="mt-2 text-body-md text-on-surface">{p.especificacao}</p>
            <p className="mt-1 text-body-sm text-on-surface-variant">Concluído em {formatDateTime(p.concluido_em)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
