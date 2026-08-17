"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { PrazoItem } from "@/types/govpro";
import { formatDate } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import Badge from "@/components/Badge";

export default function PrazosPage() {
  const [aVencer, setAVencer] = useState<PrazoItem[]>([]);
  const [vencidos, setVencidos] = useState<PrazoItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.meusPrazos(false), api.meusPrazos(true)])
      .then(([av, vc]) => {
        setAVencer(av);
        setVencidos(vc);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="px-gutter py-16 text-center text-on-surface-variant">Carregando prazos…</div>;
  }

  return (
    <div className="pb-stack-lg">
      <PageHeader title="Meus prazos" subtitle="Prazos dos processos sob sua responsabilidade." />

      <div className="px-gutter max-w-container-max mx-auto space-y-stack-md">
        <Section
          title="Vencidos"
          icon="error"
          tone="error"
          prazos={vencidos}
          emptyText="Nenhum prazo vencido."
        />
        <Section
          title="A vencer"
          icon="schedule"
          tone="primary"
          prazos={aVencer}
          emptyText="Nenhum prazo em aberto."
        />
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  tone,
  prazos,
  emptyText,
}: {
  title: string;
  icon: string;
  tone: "error" | "primary";
  prazos: PrazoItem[];
  emptyText: string;
}) {
  return (
    <div className="bg-surface-container-lowest rounded-lg border border-outline-variant overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-outline-variant">
        <span className={`material-symbols-outlined ${tone === "error" ? "text-error" : "text-primary"}`} aria-hidden="true">
          {icon}
        </span>
        <h2 className="text-headline-sm font-headline-sm">{title}</h2>
        <Badge tone={tone === "error" ? "error" : "primary"}>{prazos.length}</Badge>
      </div>
      {prazos.length === 0 ? (
        <EmptyState icon="task_alt" title={emptyText} />
      ) : (
        <ul className="divide-y divide-outline-variant">
          {prazos.map((p) => (
            <li key={p.id} className="px-5 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-body-md text-on-surface truncate">{p.titulo}</div>
                <div className="text-body-sm text-on-surface-variant">Tipo: {p.tipo}</div>
              </div>
              <Link
                href={`/processos/${p.processo_id}`}
                className="text-body-sm text-primary hover:underline"
              >
                Abrir processo
              </Link>
              <span className="text-body-sm font-medium text-on-surface-variant">
                {formatDate(p.data_vencimento)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
